import "server-only";

import { and, count, eq, ne } from "drizzle-orm";

import { db } from "@/db/client";
import {
  activityEvents,
  planDateOptions,
  planDateVotes,
  plans,
} from "@/db/schema/index.ts";
import { MAX_OPTIONS_PER_PLAN } from "@/features/dates/constants";
import type { AuthorizedContext } from "@/lib/auth/authorization-core";
import type { VoteValue } from "@/lib/consensus";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { assertTransition } from "@/lib/plan-status";
import type { PlanStatus } from "@/lib/status";

/**
 * Escritas de datas e votos.
 *
 * Toda transição automática de status acontece na **mesma transação** da escrita
 * que a causou, e emite evento (D-063). Ninguém descobre depois que o status
 * mudou sozinho e não ficou registrado.
 *
 * O limite de opções e a recusa de duplicata vivem aqui e não no schema
 * (D-065): são limites de usabilidade, e virar constraint significaria migration
 * para mudar de ideia. O único parcial de `is_confirmed` é o contrário — duas
 * datas oficiais seriam um estado impossível, então ele vive no banco.
 */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type DateOptionRow = typeof planDateOptions.$inferSelect;

export type CreateDateOptionInput = {
  startsAt: Date;
  endsAt?: Date | null;
  allDay?: boolean;
  note?: string | null;
};

/**
 * Trava o plano e devolve o estado atual. `FOR UPDATE` dentro da transação é a
 * exceção sancionada à proibição de ler-e-escrever (D-055): a janela entre a
 * checagem e a escrita é o bug, e a trava a elimina.
 */
async function lockPlan(
  tx: Tx,
  ctx: AuthorizedContext,
  planId: string,
): Promise<{ id: string; status: PlanStatus }> {
  const [plano] = await tx
    .select({ id: plans.id, status: plans.status })
    .from(plans)
    .where(and(eq(plans.workspaceId, ctx.workspaceId), eq(plans.id, planId)))
    .for("update")
    .limit(1);

  if (!plano) {
    throw new NotFoundError("Plano");
  }

  return plano;
}

/** Move o status e emite o evento, na transação de quem chamou. */
async function moveStatus(
  tx: Tx,
  ctx: AuthorizedContext,
  planId: string,
  from: PlanStatus,
  to: PlanStatus,
): Promise<void> {
  assertTransition(from, to);

  await tx
    .update(plans)
    .set({ status: to, updatedAt: new Date() })
    .where(and(eq(plans.workspaceId, ctx.workspaceId), eq(plans.id, planId)));
}

async function emit(
  tx: Tx,
  ctx: AuthorizedContext,
  verb: "date_suggested" | "vote_cast" | "date_confirmed",
  subjectId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await tx.insert(activityEvents).values({
    workspaceId: ctx.workspaceId,
    actorProfileId: ctx.profileId,
    verb,
    subjectType: "plan_date_option",
    subjectId,
    metadata,
  });
}

export async function createDateOption(
  ctx: AuthorizedContext,
  planId: string,
  input: CreateDateOptionInput,
): Promise<DateOptionRow> {
  if (input.endsAt && input.endsAt.getTime() <= input.startsAt.getTime()) {
    throw new ValidationError("O fim precisa ser depois do começo.");
  }

  return db.transaction(async (tx) => {
    const plano = await lockPlan(tx, ctx, planId);

    const existentes = await tx
      .select({
        id: planDateOptions.id,
        startsAt: planDateOptions.startsAt,
      })
      .from(planDateOptions)
      .where(
        and(
          eq(planDateOptions.workspaceId, ctx.workspaceId),
          eq(planDateOptions.planId, planId),
        ),
      );

    if (existentes.length >= MAX_OPTIONS_PER_PLAN) {
      throw new ValidationError(
        `Um plano comporta até ${MAX_OPTIONS_PER_PLAN} datas. Apague uma antes de sugerir outra.`,
      );
    }

    if (
      existentes.some(
        (opcao) => opcao.startsAt.getTime() === input.startsAt.getTime(),
      )
    ) {
      throw new ValidationError("Essa data já foi sugerida.");
    }

    const [opcao] = await tx
      .insert(planDateOptions)
      .values({
        workspaceId: ctx.workspaceId,
        planId,
        startsAt: input.startsAt,
        endsAt: input.endsAt ?? null,
        allDay: input.allDay ?? false,
        note: input.note ?? null,
        createdBy: ctx.profileId,
      })
      .returning();

    if (!opcao) {
      throw new Error("Falha ao sugerir a data.");
    }

    await emit(tx, ctx, "date_suggested", opcao.id, {
      planId,
      optionId: opcao.id,
      allDay: opcao.allDay,
    });

    /* A primeira data tira o plano de "ideia": sugerir data já é começar a
       decidir. Da segunda em diante não há transição (D-063). */
    if (existentes.length === 0 && plano.status === "idea") {
      await moveStatus(tx, ctx, planId, "idea", "deciding");
    }

    return opcao;
  });
}

/**
 * Apagar uma opção apaga os votos dela por cascata. A opção **confirmada** não
 * é apagável: desconfirmar primeiro, para o status acompanhar (seção 3).
 */
export async function deleteDateOption(
  ctx: AuthorizedContext,
  optionId: string,
): Promise<void> {
  const [removida] = await db
    .delete(planDateOptions)
    .where(
      and(
        eq(planDateOptions.workspaceId, ctx.workspaceId),
        eq(planDateOptions.id, optionId),
        eq(planDateOptions.isConfirmed, false),
      ),
    )
    .returning({ id: planDateOptions.id });

  if (!removida) {
    /* Zero linhas é opção inexistente, de outro workspace, ou confirmada. Para
       distinguir sem vazar existência, confere se ela existe neste workspace. */
    const [existe] = await db
      .select({ isConfirmed: planDateOptions.isConfirmed })
      .from(planDateOptions)
      .where(
        and(
          eq(planDateOptions.workspaceId, ctx.workspaceId),
          eq(planDateOptions.id, optionId),
        ),
      )
      .limit(1);

    if (existe?.isConfirmed) {
      throw new ValidationError(
        "Essa é a data confirmada. Desmarque antes de apagar.",
      );
    }

    throw new NotFoundError("Data");
  }
}

/** Voto é alterável a qualquer momento, por upsert (seção 4). */
export async function castVote(
  ctx: AuthorizedContext,
  optionId: string,
  vote: VoteValue,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [opcao] = await tx
      .select({ id: planDateOptions.id, planId: planDateOptions.planId })
      .from(planDateOptions)
      .where(
        and(
          eq(planDateOptions.workspaceId, ctx.workspaceId),
          eq(planDateOptions.id, optionId),
        ),
      )
      .limit(1);

    if (!opcao) {
      throw new NotFoundError("Data");
    }

    await tx
      .insert(planDateVotes)
      .values({
        workspaceId: ctx.workspaceId,
        optionId,
        profileId: ctx.profileId,
        vote,
      })
      .onConflictDoUpdate({
        target: [planDateVotes.optionId, planDateVotes.profileId],
        set: { vote, updatedAt: new Date() },
      });

    // Votar não muda status de plano. Só a confirmação muda (seção 4).
    await emit(tx, ctx, "vote_cast", optionId, {
      planId: opcao.planId,
      optionId,
      vote,
    });
  });
}

/** Tira o voto: volta a "ainda não respondeu", que não é votar `no`. */
export async function clearVote(
  ctx: AuthorizedContext,
  optionId: string,
): Promise<void> {
  await db
    .delete(planDateVotes)
    .where(
      and(
        eq(planDateVotes.workspaceId, ctx.workspaceId),
        eq(planDateVotes.optionId, optionId),
        eq(planDateVotes.profileId, ctx.profileId),
      ),
    );
}

/**
 * A operação mais delicada do bloco (seção 6).
 *
 * Transação, plano travado, **desmarcar antes de marcar** — na ordem inversa o
 * único parcial de `is_confirmed` recusaria —, mover o status e emitir evento.
 * Falhar em qualquer passo desfaz tudo.
 */
export async function confirmDateOption(
  ctx: AuthorizedContext,
  optionId: string,
): Promise<{ planId: string }> {
  return db.transaction(async (tx) => {
    const [opcao] = await tx
      .select({
        id: planDateOptions.id,
        planId: planDateOptions.planId,
        startsAt: planDateOptions.startsAt,
      })
      .from(planDateOptions)
      .where(
        and(
          eq(planDateOptions.workspaceId, ctx.workspaceId),
          eq(planDateOptions.id, optionId),
        ),
      )
      .limit(1);

    if (!opcao) {
      throw new NotFoundError("Data");
    }

    const plano = await lockPlan(tx, ctx, opcao.planId);

    if (plano.status === "completed" || plano.status === "cancelled") {
      throw new ValidationError(
        "Esse plano está encerrado e não recebe nova data.",
      );
    }

    // 1. Desmarcar qualquer outra confirmada, antes de marcar a nova.
    await tx
      .update(planDateOptions)
      .set({ isConfirmed: false })
      .where(
        and(
          eq(planDateOptions.workspaceId, ctx.workspaceId),
          eq(planDateOptions.planId, opcao.planId),
          eq(planDateOptions.isConfirmed, true),
          ne(planDateOptions.id, optionId),
        ),
      );

    // 2. Marcar a escolhida.
    await tx
      .update(planDateOptions)
      .set({ isConfirmed: true })
      .where(
        and(
          eq(planDateOptions.workspaceId, ctx.workspaceId),
          eq(planDateOptions.id, optionId),
        ),
      );

    // 3. Mover o status, quando houver o que mover.
    if (plano.status === "idea") {
      await moveStatus(tx, ctx, opcao.planId, "idea", "deciding");
      await moveStatus(tx, ctx, opcao.planId, "deciding", "planned");
    } else if (plano.status === "deciding") {
      await moveStatus(tx, ctx, opcao.planId, "deciding", "planned");
    }

    // 4. Evento, na mesma transação.
    await emit(tx, ctx, "date_confirmed", optionId, {
      planId: opcao.planId,
      optionId,
    });

    return { planId: opcao.planId };
  });
}

/**
 * Desconfirmar só em `planned` (D-064). De `reserved` existe reserva presa
 * àquela data, e desfazer sem tratar a reserva deixaria os dois em desacordo
 * sobre o que está marcado.
 */
export async function unconfirmDateOption(
  ctx: AuthorizedContext,
  planId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const plano = await lockPlan(tx, ctx, planId);

    if (plano.status === "reserved") {
      throw new ValidationError(
        "Esse plano tem reserva. Volte para Planejado antes de desmarcar a data.",
      );
    }

    if (plano.status !== "planned") {
      throw new ValidationError(
        "Só dá para desmarcar a data de um plano planejado.",
      );
    }

    const [desmarcada] = await tx
      .update(planDateOptions)
      .set({ isConfirmed: false })
      .where(
        and(
          eq(planDateOptions.workspaceId, ctx.workspaceId),
          eq(planDateOptions.planId, planId),
          eq(planDateOptions.isConfirmed, true),
        ),
      )
      .returning({ id: planDateOptions.id });

    if (!desmarcada) {
      throw new ValidationError("Esse plano não tem data confirmada.");
    }

    await moveStatus(tx, ctx, planId, "planned", "deciding");
  });
}

/**
 * Pré-condição que o `DATA_ACCESS.md` seção 5 antecipava: `deciding` → `planned`
 * manual exige data confirmada. Sem ela, `planned` é um estado que mente.
 *
 * Exportada para a mutation de status do B4 consultar dentro da transação dela.
 */
export async function countConfirmedOptions(
  tx: Tx,
  ctx: AuthorizedContext,
  planId: string,
): Promise<number> {
  const [linha] = await tx
    .select({ total: count() })
    .from(planDateOptions)
    .where(
      and(
        eq(planDateOptions.workspaceId, ctx.workspaceId),
        eq(planDateOptions.planId, planId),
        eq(planDateOptions.isConfirmed, true),
      ),
    );

  return Number(linha?.total ?? 0);
}
