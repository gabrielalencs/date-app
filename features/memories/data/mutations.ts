import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import {
  activityEvents,
  memories,
  memoryRatings,
  plans,
} from "@/db/schema/index.ts";
import type { AuthorizedContext } from "@/lib/auth/authorization-core";
import { NotFoundError, ValidationError } from "@/lib/errors";
import type { RatingValue, RepeatAnswer } from "@/lib/rating";

/**
 * Escritas das memórias.
 *
 * Duas coisas que este arquivo **não** faz, e que são o ponto do bloco:
 *
 * 1. não copia título, data, local, gastos nem fotos para lugar nenhum. A
 *    memória é o plano depois; `memories` guarda só o que não existia antes —
 *    a melhor parte e as observações;
 * 2. não emite evento a cada edição. `memory_added` sai na **primeira**
 *    avaliação de cada pessoa e mais nenhuma vez. O feed do B10 conta o que
 *    aconteceu, não quantas vezes alguém mudou de ideia sobre um jantar de três
 *    meses atrás.
 *
 * Isso diverge de propósito do `vote_cast` do B6, que emite a cada mudança: lá
 * a mudança de voto é a negociação acontecendo e faz parte da história; aqui
 * não é. O B6 fica como está.
 */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Trava o plano e exige que o date já tenha acontecido.
 *
 * `completed` é terminal na **transição**, não na escrita — é justamente o
 * estado em que avaliação e fotos de memória começam a existir (seção 3 do
 * docs/MEMORIES.md). Arquivado continua leitura em tudo, como no B8 (D-098).
 */
async function lockCompletedPlan(
  tx: Tx,
  ctx: AuthorizedContext,
  planId: string,
): Promise<{ id: string; title: string }> {
  const [plano] = await tx
    .select({
      id: plans.id,
      title: plans.title,
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
      "Esse plano está arquivado. Desarquive para poder editar.",
    );
  }

  if (plano.status !== "completed") {
    throw new ValidationError(
      "Marque o date como realizado antes de contar como foi.",
    );
  }

  return { id: plano.id, title: plano.title };
}

/**
 * A linha de `memories` do plano, criada se ainda não existir.
 *
 * Idempotente de propósito, e chamada tanto pela avaliação quanto pelo texto:
 * criar a memória na travessia para `completed` deixaria de fora todo plano
 * que já estivesse realizado antes deste bloco existir, e um `NotFound` ali
 * seria um erro que a pessoa não teria como corrigir.
 *
 * O `plan_id` é único desde o B2, então duas escritas simultâneas não podem
 * gerar duas memórias — e o plano já está travado por quem chamou.
 */
async function ensureMemory(
  tx: Tx,
  ctx: AuthorizedContext,
  planId: string,
): Promise<string> {
  const [criada] = await tx
    .insert(memories)
    .values({ workspaceId: ctx.workspaceId, planId })
    .onConflictDoNothing({ target: memories.planId })
    .returning({ id: memories.id });

  if (criada) {
    return criada.id;
  }

  const [existente] = await tx
    .select({ id: memories.id })
    .from(memories)
    .where(
      and(
        eq(memories.workspaceId, ctx.workspaceId),
        eq(memories.planId, planId),
      ),
    )
    .limit(1);

  if (!existente) {
    throw new NotFoundError("Memória");
  }

  return existente.id;
}

/**
 * A nota de quem está avaliando, de 1 a 5.
 *
 * O banco garante a faixa desde o B2 (`memory_ratings_rating_range`) e o único
 * por (memória, pessoa) impede que a mesma pessoa tenha duas notas. Aqui o
 * upsert existe para a primeira avaliação e a correção serem o mesmo caminho.
 *
 * `memory_added` sai **só** quando a linha nasce. Corrigir a nota depois não
 * acrescenta linha nenhuma ao feed.
 */
export async function setMemoryRating(
  ctx: AuthorizedContext,
  planId: string,
  rating: RatingValue,
): Promise<void> {
  await db.transaction(async (tx) => {
    const plano = await lockCompletedPlan(tx, ctx, planId);
    const memoryId = await ensureMemory(tx, ctx, planId);

    const [existente] = await tx
      .select({ id: memoryRatings.id })
      .from(memoryRatings)
      .where(
        and(
          eq(memoryRatings.workspaceId, ctx.workspaceId),
          eq(memoryRatings.memoryId, memoryId),
          eq(memoryRatings.profileId, ctx.profileId),
        ),
      )
      .limit(1);

    await tx
      .insert(memoryRatings)
      .values({
        workspaceId: ctx.workspaceId,
        memoryId,
        profileId: ctx.profileId,
        rating,
      })
      .onConflictDoUpdate({
        target: [memoryRatings.memoryId, memoryRatings.profileId],
        set: { rating, updatedAt: new Date() },
      });

    if (!existente) {
      // Mesma transação: se o evento falhar, a avaliação reverte.
      await tx.insert(activityEvents).values({
        workspaceId: ctx.workspaceId,
        actorProfileId: ctx.profileId,
        verb: "memory_added",
        subjectType: "plan",
        subjectId: planId,
        metadata: { title: plano.title },
      });
    }
  });
}

/**
 * Retira a avaliação de quem está olhando — reenviar a mesma nota chega aqui.
 *
 * Apaga a linha inteira, e com ela o "repetiria?". Não é descuido: `rating` é
 * `NOT NULL` desde o B2, então não existe avaliação sem nota, e uma resposta de
 * "repetiria" sozinha seria uma avaliação pela metade que a tela não saberia
 * mostrar. Sem nota, aquela pessoa volta a "ainda não avaliou" — o mesmo estado
 * em que estava antes, e que não é nota baixa (D-062).
 *
 * Sem evento: o feed não registra arrependimento.
 */
export async function clearMemoryRating(
  ctx: AuthorizedContext,
  planId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await lockCompletedPlan(tx, ctx, planId);

    const [memoria] = await tx
      .select({ id: memories.id })
      .from(memories)
      .where(
        and(
          eq(memories.workspaceId, ctx.workspaceId),
          eq(memories.planId, planId),
        ),
      )
      .limit(1);

    // Nada para retirar não é erro: é o estado que se queria alcançar.
    if (!memoria) return;

    await tx
      .delete(memoryRatings)
      .where(
        and(
          eq(memoryRatings.workspaceId, ctx.workspaceId),
          eq(memoryRatings.memoryId, memoria.id),
          eq(memoryRatings.profileId, ctx.profileId),
        ),
      );
  });
}

/**
 * "Repetiria?" — `yes`, `maybe`, `no`, ou `null` para retirar a resposta.
 *
 * Depende da nota existir, pelo motivo do `clearMemoryRating`. A interface só
 * mostra o controle depois da nota, e isto aqui recusa de novo: o frontend
 * nunca é fonte de autoridade.
 *
 * Sem evento — é a mesma avaliação, mudando de detalhe.
 */
export async function setMemoryRepeat(
  ctx: AuthorizedContext,
  planId: string,
  wouldRepeat: RepeatAnswer | null,
): Promise<void> {
  await db.transaction(async (tx) => {
    await lockCompletedPlan(tx, ctx, planId);

    const [memoria] = await tx
      .select({ id: memories.id })
      .from(memories)
      .where(
        and(
          eq(memories.workspaceId, ctx.workspaceId),
          eq(memories.planId, planId),
        ),
      )
      .limit(1);

    const alteradas = memoria
      ? await tx
          .update(memoryRatings)
          .set({ wouldRepeat, updatedAt: new Date() })
          .where(
            and(
              eq(memoryRatings.workspaceId, ctx.workspaceId),
              eq(memoryRatings.memoryId, memoria.id),
              eq(memoryRatings.profileId, ctx.profileId),
            ),
          )
          .returning({ id: memoryRatings.id })
      : [];

    if (alteradas.length === 0) {
      throw new ValidationError(
        "Dê sua nota antes de dizer se repetiria.",
      );
    }
  });
}

export type MemoryTextInput = {
  highlight: string | null;
  notes: string | null;
};

/**
 * A melhor parte e as observações — do casal, uma por plano.
 *
 * Não é por pessoa de propósito (seção 4): a melhor parte de uma noite é uma
 * coisa só, escrita junto, e duplicá-la por pessoa transformaria uma lembrança
 * compartilhada em dois depoimentos paralelos. A nota é de cada um porque
 * opinião é de cada um; isto não é opinião.
 *
 * Sem evento, pelo mesmo motivo do checklist no B8 (D-097).
 */
export async function saveMemoryText(
  ctx: AuthorizedContext,
  planId: string,
  input: MemoryTextInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    await lockCompletedPlan(tx, ctx, planId);
    const memoryId = await ensureMemory(tx, ctx, planId);

    await tx
      .update(memories)
      .set({
        highlight: input.highlight,
        notes: input.notes,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(memories.workspaceId, ctx.workspaceId),
          eq(memories.id, memoryId),
        ),
      );
  });
}
