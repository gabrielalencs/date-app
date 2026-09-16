import "server-only";

import webpush from "web-push";

import {
  classifyPushStatus,
  type PushPayload,
  type PushSender,
  type PushTarget,
  type SendOutcome,
} from "@/features/notifications/send/sender";

/**
 * O remetente de verdade (seção 18 do docs/NOTIFICATIONS.md).
 *
 * `web-push` é a implementação de referência do RFC 8291 mantida pela
 * `web-push-libs`, e é a que a própria documentação do Next indica no guia de
 * PWA. Criptografia de Web Push escrita à mão aqui seria erro de julgamento:
 * são ECDH, HKDF e AES-GCM com um formato de envelope que precisa bater byte a
 * byte com o que o navegador espera, e o sintoma de errar é silêncio.
 *
 * A private key nunca sai do servidor: este módulo é `server-only` e a chave é
 * lida de `process.env` na primeira chamada, não no topo — assim o import não
 * derruba o build de um ambiente que ainda não configurou VAPID.
 */

let configurado = false;

export class VapidConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VapidConfigError";
  }
}

function configure(): void {
  if (configurado) return;

  const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.WEB_PUSH_VAPID_SUBJECT?.trim();

  if (!publicKey || !privateKey || !subject) {
    /* Mensagem sem valor nenhum dentro: dizer qual variável falta é diagnóstico,
       imprimir o conteúdo dela seria vazar a chave no log. */
    throw new VapidConfigError(
      "VAPID não configurado: defina NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY, " +
        "WEB_PUSH_VAPID_PRIVATE_KEY e WEB_PUSH_VAPID_SUBJECT.",
    );
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  configurado = true;
}

export const webPushSender: PushSender = async (
  target: PushTarget,
  payload: PushPayload,
): Promise<SendOutcome> => {
  try {
    configure();
  } catch (error) {
    /* Erro operacional, não erro da subscription. Devolver `failed` mantém a
       subscription intacta: apagá-la por configuração errada do servidor seria
       destruir o cadastro de quem não fez nada. */
    return {
      status: "failed",
      errorCode: error instanceof VapidConfigError ? "vapid_config" : "unknown",
    };
  }

  try {
    const resposta = await webpush.sendNotification(
      {
        endpoint: target.endpoint,
        keys: { p256dh: target.p256dh, auth: target.auth },
      },
      JSON.stringify(payload),
      { TTL: 60 * 60 * 12 },
    );

    return classifyPushStatus(resposta.statusCode);
  } catch (error) {
    const statusCode =
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      typeof (error as { statusCode: unknown }).statusCode === "number"
        ? (error as { statusCode: number }).statusCode
        : undefined;

    if (statusCode !== undefined) {
      return classifyPushStatus(statusCode);
    }

    return { status: "failed", errorCode: "network" };
  }
};
