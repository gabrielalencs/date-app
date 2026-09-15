import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { activityEvents, memoryRatings, plans } from "@/db/schema/index.ts";
import {
  MAX_HIGHLIGHT_LENGTH,
  MAX_NOTES_LENGTH,
} from "@/features/memories/constants";
import type { AuthorizedContext } from "@/lib/auth/authorization-core";
import { NotFoundError, ValidationError } from "@/lib/errors";
import type { RatingValue, RepeatAnswer } from "@/lib/rating";
import type { PlanStatus } from "@/lib/status";

/**
 * Escritas da avaliação.
 *
 * A **travessia** para `completed` não está aqui de propósito: ela já é
 * `changePlanStatus`, que desde o B4 trava a linha, valida a transição no
 * grafo, consulta as pré-condições dentro da transação e emite
 * `plan_completed`. O B9 acrescentou a pré-condição em `lib/plan-preconditions`
 * — o lugar que o B8 criou — e não um segundo caminho de escrita. Dois
 * caminhos para a mesma transição é como um deles esquece de emitir o evento.
 *
 * O que muda aqui é o evento da avaliação: **a primeira** de cada pessoa emite
 * `memory_added`; editar a nota depois não emite. O feed do B10 conta o que
 * aconteceu, não quantas vezes alguém mudou de ideia sobre um jantar de três
 * meses atrás. Isso diverge de propósito do `vote_cast` do B6, que emite a cada
 * mudança — lá a mudança de voto é a negociação acontecendo e faz parte da
 * história; aqui não é. O B6 fica como está (seção 8).
 */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type PlanoTravado = {
  id: string;
  status: PlanStatus;
  archivedAt: Date | null;
};

/**
 * Trava o plano e confere que ele aceita avaliação.
 *
 * `completed` é terminal na **transição**, não na escrita (seção 3). É o estado
 * em que metade do B9 começa a funcionar: avaliação e fotos de memória só
 * existem depois dele, e os gastos continuam editáveis porque é depois que se
 * sabe quanto custou. Uma regra do tipo "status terminal é somente leitura"
 * mataria a funcionalidade inteira.
 *
 * A checagem é de status, e status muda — por isso ela vive na aplicação,
 * dentro da transação, e não no banco (seção 10).
 */
async function lockCompletedPlan(
  tx: Tx,
  ctx: AuthorizedContext,
  planId: string,
): Promise<PlanoTravado> {
  const [plano] = await tx
    .select({
      id: plans.id,
      status: plans.status,
      archivedAt: plans.archivedAt,
    })
    .from(plans)
    .where(and(eq(plans.workspaceId, ctx.workspaceId), eq(plans.id, planId)))
    .for("update")
    .limit(1);

  if (!plano) {
    throw new NotFoundError("Plano");
  }

  if (plano.archivedAt !== null) {
    throw new ValidationError(
      "Esse plano está arquivado. Desarquive para poder avaliar.",
    );
  }

  if (plano.status !== "completed") {
    throw new ValidationError(
      "A avaliação aparece depois que o date é marcado como realizado.",
    );
  }

  return plano;
}

/** A avaliação de quem está escrevendo, com a linha do plano já travada. */
async function minhaAvaliacao(
  tx: Tx,
  ctx: AuthorizedContext,
  planId: string,
): Promise<{ id: string } | null> {
  const [linha] = await tx
    .select({ id: memoryRatings.id })
    .from(memoryRatings)
    .where(
      and(
        eq(memoryRatings.workspaceId, ctx.workspaceId),
        eq(memoryRatings.planId, planId),
        eq(memoryRatings.profileId, ctx.profileId),
      ),
    )
    .limit(1);

  return linha ?? null;
}

/**
 * Dá ou muda a nota. É por ela que a avaliação nasce: `rating` é NOT NULL, e
 * "repetiria", "melhor parte" e observações são campos da mesma linha.
 *
 * Devolve se esta foi a primeira avaliação desta pessoa neste plano. O evento
 * já foi gravado aqui, na mesma transação; quem chama usa o retorno apenas
 * para saber o que aconteceu.
 */
export async function rateMemory(
  ctx: AuthorizedContext,
  planId: string,
  rating: RatingValue,
): Promise<{ firstTime: boolean }> {
  return db.transaction(async (tx) => {
    await lockCompletedPlan(tx, ctx, planId);

    /* Ler antes de escrever é o padrão proibido — exceto com a linha travada,
       dentro da mesma transação (D-055). O plano está travado acima, e toda
       escrita de avaliação passa por essa trava, então duas pessoas avaliando
       ao mesmo tempo serializam e nenhuma das duas se vê como "primeira" por
       engano. */
    const existente = await minhaAvaliacao(tx, ctx, planId);

    await tx
      .insert(memoryRatings)
      .values({
        workspaceId: ctx.workspaceId,
        planId,
        profileId: ctx.profileId,
        rating,
      })
      /* O único em (plan_id, profile_id) é a garantia de "uma por pessoa"; o
         upsert existe para a primeira nota e a correção serem o mesmo caminho.
         Os textos não são tocados: mudar de 4 para 5 não apaga o que a pessoa
         escreveu. */
      .onConflictDoUpdate({
        target: [memoryRatings.planId, memoryRatings.profileId],
        set: { rating, updatedAt: new Date() },
      });

    if (!existente) {
      await tx.insert(activityEvents).values({
        workspaceId: ctx.workspaceId,
        actorProfileId: ctx.profileId,
        verb: "memory_added",
        subjectType: "plan",
        subjectId: planId,
        metadata: { rating },
      });
    }

    return { firstTime: !existente };
  });
}

/**
 * Retira a avaliação: reenviar a mesma nota devolve a pessoa a "ainda não
 * avaliou", que é estado distinto de ter dado nota baixa (seção 4).
 *
 * Apaga a linha inteira, e com ela "repetiria", "melhor parte" e observações —
 * `rating` é NOT NULL, então avaliação sem nota não é um estado que exista. O
 * controle na tela avisa isso antes do clique.
 *
 * Não emite evento, nem de retirada: o feed conta o que aconteceu no date, e
 * desmarcar uma nota não é um acontecimento. Emitir aqui também faria a
 * próxima nota da mesma pessoa contar como "primeira" de novo.
 */
export async function clearMemoryRating(
  ctx: AuthorizedContext,
  planId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await lockCompletedPlan(tx, ctx, planId);

    await tx
      .delete(memoryRatings)
      .where(
        and(
          eq(memoryRatings.workspaceId, ctx.workspaceId),
          eq(memoryRatings.planId, planId),
          eq(memoryRatings.profileId, ctx.profileId),
        ),
      );
  });
}

/**
 * "Repetiria?" — o controle segmentado do B6, com rótulos próprios. `null`
 * retira a resposta sem tocar na nota.
 *
 * Exige avaliação existente: a coluna mora na mesma linha da nota.
 */
export async function setWouldRepeat(
  ctx: AuthorizedContext,
  planId: string,
  answer: RepeatAnswer | null,
): Promise<void> {
  await escreverNaMinhaAvaliacao(ctx, planId, { wouldRepeat: answer });
}

export type MemoryNotesInput = {
  highlight: string | null;
  notes: string | null;
};

export async function saveMemoryNotes(
  ctx: AuthorizedContext,
  planId: string,
  input: MemoryNotesInput,
): Promise<void> {
  /* O Zod da action já recusa por tamanho, com a frase que a pessoa lê. Isto
     aqui é a mesma recusa para quem chamar a camada de dados direto — teste de
     integração incluído. */
  if ((input.highlight?.length ?? 0) > MAX_HIGHLIGHT_LENGTH) {
    throw new ValidationError("A melhor parte ficou longa demais.");
  }

  if ((input.notes?.length ?? 0) > MAX_NOTES_LENGTH) {
    throw new ValidationError("As observações ficaram longas demais.");
  }

  await escreverNaMinhaAvaliacao(ctx, planId, {
    highlight: input.highlight,
    notes: input.notes,
  });
}

/**
 * Atualiza campos da própria avaliação. Ninguém escreve na avaliação do outro:
 * o `where` fixa `ctx.profileId`, e não um id que viesse do formulário.
 */
async function escreverNaMinhaAvaliacao(
  ctx: AuthorizedContext,
  planId: string,
  campos: Partial<{
    wouldRepeat: RepeatAnswer | null;
    highlight: string | null;
    notes: string | null;
  }>,
): Promise<void> {
  await db.transaction(async (tx) => {
    await lockCompletedPlan(tx, ctx, planId);

    const [linha] = await tx
      .update(memoryRatings)
      .set({ ...campos, updatedAt: new Date() })
      .where(
        and(
          eq(memoryRatings.workspaceId, ctx.workspaceId),
          eq(memoryRatings.planId, planId),
          eq(memoryRatings.profileId, ctx.profileId),
        ),
      )
      .returning({ id: memoryRatings.id });

    if (!linha) {
      throw new ValidationError("Dê uma nota antes de escrever sobre o date.");
    }
  });
}
