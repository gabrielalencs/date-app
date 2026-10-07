"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  findOwnActiveSubscription,
  getPreferences,
  recordTestPushOutcome,
  removeSubscription,
  saveSubscription,
  savePreferences,
} from "@/features/notifications/data/subscriptions";
import {
  TEST_PUSH_PAYLOAD,
  testPushStateFor,
  type TestPushState,
} from "@/features/notifications/send/test-push";
import { webPushSender } from "@/features/notifications/send/web-push-sender";
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

/**
 * Manda um push de teste para este navegador, e só para ele (D-181).
 *
 * O caminho é o mesmo do Workflow — o mesmo remetente, as mesmas chaves, o
 * mesmo push service —, só que agora e com a resposta voltando para a tela. É o
 * que separa "o servidor está mal configurado" de "este aparelho não mostra
 * notificação", e até aqui as duas coisas tinham o mesmo sintoma: nada.
 *
 * Sem `revalidatePath`: o desfecho volta no retorno, e a página não lê nada
 * que o teste mude.
 */
export async function sendTestPushAction(
  rawEndpoint: unknown,
): Promise<TestPushState> {
  const ctx = await requireAuthorizedContext();
  const parsed = endpointSchema.safeParse(rawEndpoint);

  if (!parsed.success) {
    return { ok: false, motivo: "sem-registro" };
  }

  const alvo = await findOwnActiveSubscription(ctx, parsed.data);
  if (!alvo) {
    return { ok: false, motivo: "sem-registro" };
  }

  const resultado = await webPushSender(alvo, TEST_PUSH_PAYLOAD);
  await recordTestPushOutcome(ctx, alvo.id, resultado.status);

  return testPushStateFor(resultado);
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
