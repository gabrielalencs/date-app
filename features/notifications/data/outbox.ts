import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { workspaceMembers } from "@/db/schema/index.ts";
import {
  enqueueIntent,
  cancelOpenIntents,
} from "@/features/notifications/data/intents";
import type { NotificationKind } from "@/features/notifications/kinds";
import { dedupeKeyFor } from "@/features/notifications/policy/dedupe";
import { recipientsFor } from "@/features/notifications/policy/recipients";
import {
  dueAtFor,
  reminderSchedule,
} from "@/features/notifications/policy/schedule";
import type { AuthorizedContext } from "@/lib/auth/authorization-core";
import { dayKey } from "@/lib/datetime";

/**
 * A ponte entre uma mutation e a fila de notificação.
 *
 * É o único lugar onde uma mutation de domínio toca notificação, e ela toca por
 * uma linha. Toda a decisão — quem recebe, quando, com que chave de agregação e
 * quais fatos vão para a revalidação — está na `policy`, que é pura. Aqui só
 * acontece a escrita, e ela acontece **no `tx` de quem chamou**.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function membersOf(tx: Tx, ctx: AuthorizedContext): Promise<string[]> {
  const linhas = await tx
    .select({ profileId: workspaceMembers.profileId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.workspaceId, ctx.workspaceId));

  return linhas.map((linha) => linha.profileId);
}

/**
 * Enfileira a notificação do parceiro para uma ação do ator.
 *
 * Devolve os ids criados para o chamador iniciar o workflow **depois do
 * commit**. Se o workspace tiver só o ator — o que não acontece na V1, mas
 * acontece em fixture de teste —, devolve lista vazia e ninguém é notificado.
 */
export async function enqueuePartnerIntent(
  tx: Tx,
  ctx: AuthorizedContext,
  input: {
    kind: NotificationKind;
    planId: string;
    now: Date;
    expected?: Record<string, unknown>;
  },
): Promise<string[]> {
  const membros = await membersOf(tx, ctx);
  const destinatarios = recipientsFor({
    kind: input.kind,
    memberProfileIds: membros,
    actorProfileId: ctx.profileId,
  });

  const dedupeKey = dedupeKeyFor({
    kind: input.kind,
    planId: input.planId,
    actorProfileId: ctx.profileId,
  });
  const dueAt = dueAtFor(input.kind, input.now);

  const ids: string[] = [];
  for (const recipientProfileId of destinatarios) {
    const { id } = await enqueueIntent(tx, ctx, {
      recipientProfileId,
      actorProfileId: ctx.profileId,
      planId: input.planId,
      kind: input.kind,
      dedupeKey,
      dueAt,
      expected: input.expected,
    });
    ids.push(id);
  }

  return ids;
}

/**
 * Os lembretes 7/5/3/1 de uma data confirmada, para as duas pessoas.
 *
 * Lembrete não tem ator: o date é dos dois. Por isso `actorProfileId` fica nulo
 * e os dois membros entram, cada um filtrado depois pelas próprias preferences.
 *
 * `expected` carrega opção e dia. Se a data mudar, o workflow antigo acorda,
 * compara e se cala — a garantia não depende de o cancelamento ter alcançado a
 * linha a tempo.
 */
export async function enqueueDateReminders(
  tx: Tx,
  ctx: AuthorizedContext,
  input: { planId: string; optionId: string; startsAt: Date; now: Date },
): Promise<string[]> {
  const membros = await membersOf(tx, ctx);
  const destinatarios = recipientsFor({
    kind: "date_reminder",
    memberProfileIds: membros,
    actorProfileId: null,
  });

  const chaveDoDia = dayKey(input.startsAt);
  const ids: string[] = [];

  for (const slot of reminderSchedule(input.startsAt, input.now)) {
    const dedupeKey = dedupeKeyFor({
      kind: "date_reminder",
      planId: input.planId,
      offsetDays: slot.offsetDays,
    });

    for (const recipientProfileId of destinatarios) {
      const { id } = await enqueueIntent(tx, ctx, {
        recipientProfileId,
        actorProfileId: null,
        planId: input.planId,
        kind: "date_reminder",
        dedupeKey,
        dueAt: slot.dueAt,
        expected: {
          confirmedOptionId: input.optionId,
          dayKey: chaveDoDia,
          offsetDays: slot.offsetDays,
        },
      });
      ids.push(id);
    }
  }

  return ids;
}

/** Lembretes que não fazem mais sentido: o date saiu de cena. */
export async function cancelDateReminders(
  tx: Tx,
  ctx: AuthorizedContext,
  planId: string,
): Promise<number> {
  return cancelOpenIntents(tx, ctx, {
    planId,
    kinds: ["date_reminder"],
  });
}
