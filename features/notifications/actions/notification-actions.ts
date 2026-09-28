"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  getPreferences,
  removeSubscription,
  saveSubscription,
  savePreferences,
} from "@/features/notifications/data/subscriptions";
import { pushSubscriptionSchema } from "@/features/notifications/subscription-schema";
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
 * Grava — ou regrava — a subscription deste navegador.
 *
 * Idempotente pelo upsert no `endpoint`, e é por isso que o Perfil a chama a
 * cada visita quando o navegador já está inscrito: é assim que um aparelho que
 * se inscreveu sem o servidor ter gravado se conserta sozinho (D-180).
 *
 * Sem `revalidatePath`: nada que o Perfil renderiza depende de subscription, e
 * revalidar aqui custaria uma renderização inteira da página a cada visita.
 */
export async function subscribeToPushAction(
  raw: unknown,
): Promise<NotificationActionState> {
  const ctx = await requireAuthorizedContext();
  const parsed = pushSubscriptionSchema.safeParse(raw);

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
