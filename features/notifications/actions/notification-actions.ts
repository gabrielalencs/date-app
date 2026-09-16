"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  getPreferences,
  removeSubscription,
  saveSubscription,
  savePreferences,
} from "@/features/notifications/data/subscriptions";
import { requireAuthorizedContext } from "@/lib/auth/authorization";

/**
 * As Server Actions do B11.5.
 *
 * O browser manda a subscription; **não** manda quem é. `profileId` e
 * `workspaceId` saem de `requireAuthorizedContext()`, e um payload que tentasse
 * incluí-los seria recusado pelo Zod estrito — associar a subscription a outra
 * pessoa é exatamente o ataque que essa fronteira existe para impedir.
 */

export type NotificationActionState = { error?: string; ok?: boolean };

/**
 * A forma que `PushSubscription.toJSON()` devolve.
 *
 * Tetos generosos mas finitos: endpoint de push service é longo e varia por
 * navegador, e um campo sem teto é um convite a gravar um megabyte de lixo.
 */
const subscriptionSchema = z.strictObject({
  endpoint: z.url().max(2048),
  keys: z.strictObject({
    p256dh: z.string().min(1).max(256),
    auth: z.string().min(1).max(256),
  }),
});

export async function subscribeToPushAction(
  raw: unknown,
): Promise<NotificationActionState> {
  const ctx = await requireAuthorizedContext();
  const parsed = subscriptionSchema.safeParse(raw);

  if (!parsed.success) {
    /* Sem detalhe do Zod na resposta: a mensagem do parser descreve a forma do
       payload, e forma de payload é informação sobre a fronteira. */
    return { error: "Não foi possível registrar este aparelho." };
  }

  await saveSubscription(ctx, {
    endpoint: parsed.data.endpoint,
    p256dh: parsed.data.keys.p256dh,
    auth: parsed.data.keys.auth,
  });

  revalidatePath("/perfil");
  return { ok: true };
}

const endpointSchema = z.url().max(2048);

export async function unsubscribeFromPushAction(
  rawEndpoint: unknown,
): Promise<NotificationActionState> {
  const ctx = await requireAuthorizedContext();
  const parsed = endpointSchema.safeParse(rawEndpoint);

  if (!parsed.success) {
    return { error: "Não foi possível desativar este aparelho." };
  }

  await removeSubscription(ctx, parsed.data);

  revalidatePath("/perfil");
  return { ok: true };
}

const preferencesSchema = z.strictObject({
  activityEnabled: z.boolean().optional(),
  dateRemindersEnabled: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
  previewMode: z.enum(["private", "full"]).optional(),
});

export async function savePreferencesAction(
  raw: unknown,
): Promise<NotificationActionState> {
  const ctx = await requireAuthorizedContext();
  const parsed = preferencesSchema.safeParse(raw);

  if (!parsed.success) {
    return { error: "Não foi possível salvar essa preferência." };
  }

  await savePreferences(ctx, parsed.data);

  revalidatePath("/perfil");
  return { ok: true };
}

/** Leitura para a tela, já com os defaults aplicados. */
export async function readPreferencesAction() {
  const ctx = await requireAuthorizedContext();
  return getPreferences(ctx);
}
