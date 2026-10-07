import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db/client";
import {
  notificationPreferences,
  pushSubscriptions,
} from "@/db/schema/index.ts";
import type { PreviewMode } from "@/features/notifications/templates";
import type { AuthorizedContext } from "@/lib/auth/authorization-core";

/**
 * A parte do B11.5 que uma pessoa autenticada usa.
 *
 * Aqui vale a regra normal do `docs/DATA_ACCESS.md`: `AuthorizedContext`
 * primeiro, predicado de workspace dentro do UPDATE, e o browser nunca manda
 * `profileId`. A fronteira de sistema, sem contexto, é outro arquivo e não se
 * mistura com este.
 */

export type NotificationPreferences = {
  pushEnabled: boolean;
  activityEnabled: boolean;
  dateRemindersEnabled: boolean;
  previewMode: PreviewMode;
};

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  pushEnabled: true,
  activityEnabled: true,
  dateRemindersEnabled: true,
  /* O lock screen é público para quem estiver perto da pessoa: detalhe é
     opt-in, nunca default (seção 13 do docs/NOTIFICATIONS.md). */
  previewMode: "private",
};

export async function getPreferences(
  ctx: AuthorizedContext,
): Promise<NotificationPreferences> {
  const [linha] = await db
    .select({
      pushEnabled: notificationPreferences.pushEnabled,
      activityEnabled: notificationPreferences.activityEnabled,
      dateRemindersEnabled: notificationPreferences.dateRemindersEnabled,
      previewMode: notificationPreferences.previewMode,
    })
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.workspaceId, ctx.workspaceId),
        eq(notificationPreferences.profileId, ctx.profileId),
      ),
    )
    .limit(1);

  if (!linha) return DEFAULT_PREFERENCES;

  return { ...linha, previewMode: linha.previewMode as PreviewMode };
}

export async function savePreferences(
  ctx: AuthorizedContext,
  patch: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  const atual = await getPreferences(ctx);
  const proximo = { ...atual, ...patch };

  await db
    .insert(notificationPreferences)
    .values({
      workspaceId: ctx.workspaceId,
      profileId: ctx.profileId,
      ...proximo,
    })
    .onConflictDoUpdate({
      target: [
        notificationPreferences.workspaceId,
        notificationPreferences.profileId,
      ],
      set: { ...proximo, updatedAt: new Date() },
    });

  return proximo;
}

export type SubscriptionInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

/**
 * Registra o navegador atual.
 *
 * O `endpoint` é único global: reinstalar a PWA devolve o mesmo endpoint e o
 * upsert reaproveita a linha em vez de criar uma segunda. O `disabledAt` volta
 * a nulo, porque uma subscription que foi marcada stale e reapareceu está viva
 * de novo.
 *
 * O workspace e o profile vêm do contexto, nunca do corpo da requisição.
 */
export async function saveSubscription(
  ctx: AuthorizedContext,
  input: SubscriptionInput,
): Promise<void> {
  await db
    .insert(pushSubscriptions)
    .values({
      workspaceId: ctx.workspaceId,
      profileId: ctx.profileId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
    })
    .onConflictDoUpdate({
      target: [pushSubscriptions.endpoint],
      set: {
        workspaceId: ctx.workspaceId,
        profileId: ctx.profileId,
        p256dh: input.p256dh,
        auth: input.auth,
        disabledAt: null,
        updatedAt: new Date(),
      },
    });
}

/**
 * Desativa o navegador atual — e só ele.
 *
 * O predicado inclui `profile_id` do contexto: mesmo que alguém envie o
 * endpoint da outra pessoa, o UPDATE não alcança linha nenhuma. Idempotente:
 * desinscrever duas vezes é o mesmo que uma.
 */
export async function removeSubscription(
  ctx: AuthorizedContext,
  endpoint: string,
): Promise<void> {
  await db
    .update(pushSubscriptions)
    .set({ disabledAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(pushSubscriptions.workspaceId, ctx.workspaceId),
        eq(pushSubscriptions.profileId, ctx.profileId),
        eq(pushSubscriptions.endpoint, endpoint),
      ),
    );
}

/**
 * A subscription ativa deste navegador — se ela for desta pessoa.
 *
 * Para o envio de teste do Perfil (D-181). O endpoint vem do navegador, mas o
 * predicado leva o profile e o workspace do contexto: o endpoint de outra
 * pessoa não encontra linha nenhuma, e o teste não vira um jeito de mandar push
 * para o telefone dela.
 */
export async function findOwnActiveSubscription(
  ctx: AuthorizedContext,
  endpoint: string,
): Promise<(SubscriptionInput & { id: string }) | null> {
  const [linha] = await db
    .select({
      id: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.workspaceId, ctx.workspaceId),
        eq(pushSubscriptions.profileId, ctx.profileId),
        eq(pushSubscriptions.endpoint, endpoint),
        isNull(pushSubscriptions.disabledAt),
      ),
    )
    .limit(1);

  return linha ?? null;
}

/**
 * O que o envio de teste ensinou sobre a subscription, com a regra das
 * entregas: aceito vira `last_success_at`, 404/410 desativa, e falha temporária
 * ou de configuração não encosta na linha.
 */
export async function recordTestPushOutcome(
  ctx: AuthorizedContext,
  subscriptionId: string,
  status: "sent" | "stale" | "failed",
): Promise<void> {
  if (status === "failed") return;

  const agora = new Date();
  await db
    .update(pushSubscriptions)
    .set(
      status === "sent"
        ? { lastSuccessAt: agora, updatedAt: agora }
        : { disabledAt: agora, updatedAt: agora },
    )
    .where(
      and(
        eq(pushSubscriptions.id, subscriptionId),
        eq(pushSubscriptions.workspaceId, ctx.workspaceId),
        eq(pushSubscriptions.profileId, ctx.profileId),
      ),
    );
}

/** Quantos navegadores desta pessoa estão ativos. Para a tela do Perfil. */
export async function countActiveSubscriptions(
  ctx: AuthorizedContext,
): Promise<number> {
  const linhas = await db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.workspaceId, ctx.workspaceId),
        eq(pushSubscriptions.profileId, ctx.profileId),
        isNull(pushSubscriptions.disabledAt),
      ),
    );

  return linhas.length;
}
