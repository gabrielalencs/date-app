import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { notificationIntents } from "@/db/schema/index.ts";
import type { NotificationKind } from "@/features/notifications/kinds";
import type { AuthorizedContext } from "@/lib/auth/authorization-core";

/**
 * A escrita da intenção, **dentro da transação do domínio** (seção 19 do
 * docs/NOTIFICATIONS.md).
 *
 * Nenhuma função aqui abre transação própria: todas recebem o `tx` da mutation
 * que as chama. É o que garante a ordem do outbox — se a intent falhar, a
 * escrita de domínio reverte junto, e nunca existe uma notificação prometida
 * sobre um fato que não foi gravado.
 *
 * O caminho contrário também é regra: Workflow e Web Push **nunca** entram
 * aqui. Rede dentro de transação Neon é a transação segurando linha travada
 * enquanto espera um terceiro.
 */

/** O `tx` do Drizzle, na mesma forma que as outras features já usam. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type EnqueueIntentInput = {
  recipientProfileId: string;
  actorProfileId: string | null;
  planId: string | null;
  kind: NotificationKind;
  dedupeKey: string;
  dueAt: Date;
  expected?: Record<string, unknown>;
};

export type EnqueuedIntent = { id: string; created: boolean };

/**
 * Cria — ou agrega em — uma intenção aberta.
 *
 * O `onConflictDoUpdate` mira o índice **parcial** de intents abertas. O efeito
 * é o debounce do produto: quatro datas sugeridas dentro da janela caem na
 * mesma linha e o `due_at` mais recente vence, então a notificação sai uma vez,
 * depois que a pessoa parou de mexer.
 *
 * `expected` é sobrescrito de propósito. O fato que vale é o último: quem trocou
 * o voto de sim para talvez quer que a revalidação compare com talvez.
 */
export async function enqueueIntent(
  tx: Tx,
  ctx: AuthorizedContext,
  input: EnqueueIntentInput,
): Promise<EnqueuedIntent> {
  const [linha] = await tx
    .insert(notificationIntents)
    .values({
      workspaceId: ctx.workspaceId,
      recipientProfileId: input.recipientProfileId,
      actorProfileId: input.actorProfileId,
      planId: input.planId,
      kind: input.kind,
      dedupeKey: input.dedupeKey,
      dueAt: input.dueAt,
      expected: input.expected ?? null,
    })
    .onConflictDoUpdate({
      target: [
        notificationIntents.workspaceId,
        notificationIntents.recipientProfileId,
        notificationIntents.dedupeKey,
      ],
      targetWhere: sql`${notificationIntents.status} in ('pending', 'processing')`,
      set: {
        dueAt: input.dueAt,
        expected: input.expected ?? null,
        actorProfileId: input.actorProfileId,
        updatedAt: new Date(),
      },
    })
    .returning({
      id: notificationIntents.id,
      createdAt: notificationIntents.createdAt,
      updatedAt: notificationIntents.updatedAt,
    });

  if (!linha) {
    throw new Error("Falha ao registrar a intenção de notificação.");
  }

  /* `created` decide se vale a pena iniciar um workflow novo: quando a linha já
     existia, o run dela continua dormindo e vai reler o `due_at` atualizado. */
  const created = linha.createdAt.getTime() === linha.updatedAt.getTime();
  return { id: linha.id, created };
}

/**
 * Cancela intenções abertas de um plano.
 *
 * Usado quando o plano sai de cena: cancelar, arquivar ou concluir apaga os
 * lembretes que ainda não saíram. A revalidação sozinha já impediria o envio,
 * mas cancelar é mais honesto — deixa a tabela dizendo a verdade sobre o que
 * ainda vai acontecer, e não obriga o workflow a acordar para descobrir que não
 * tinha nada a fazer.
 */
export async function cancelOpenIntents(
  tx: Tx,
  ctx: AuthorizedContext,
  input: { planId: string; kinds: readonly NotificationKind[] },
): Promise<number> {
  const linhas = await tx
    .update(notificationIntents)
    .set({
      status: "cancelled",
      cancelledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(notificationIntents.workspaceId, ctx.workspaceId),
        eq(notificationIntents.planId, input.planId),
        inArray(notificationIntents.kind, [...input.kinds]),
        eq(notificationIntents.status, "pending"),
      ),
    )
    .returning({ id: notificationIntents.id });

  return linhas.length;
}
