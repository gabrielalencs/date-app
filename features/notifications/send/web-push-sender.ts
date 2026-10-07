import "server-only";

import webpush from "web-push";

import {
  classifyPushStatus,
  pushServiceReason,
  type PushPayload,
  type PushSender,
  type PushTarget,
  type SendOutcome,
} from "@/features/notifications/send/sender";
import { vapidPairMatches } from "@/features/notifications/send/vapid";

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

/**
 * Teto de ociosidade do socket com o push service (D-181).
 *
 * Sem ele, o `https.request` do `web-push` espera para sempre. Um push service
 * que aceita a conexão e não responde segura o step até a plataforma matá-lo,
 * e um step morto no meio deixa a intent em `processing` — estado que o
 * recovery não procura. Dez segundos é folga larga para um POST que responde
 * em menos de um.
 */
const TIMEOUT_MS = 10_000;

let configurado = false;

export type VapidErrorCode =
  "vapid_missing" | "vapid_invalid" | "vapid_mismatch";

export class VapidConfigError extends Error {
  readonly code: VapidErrorCode;

  constructor(code: VapidErrorCode, message: string) {
    super(message);
    this.name = "VapidConfigError";
    this.code = code;
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
      "vapid_missing",
      "VAPID não configurado: defina NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY, " +
        "WEB_PUSH_VAPID_PRIVATE_KEY e WEB_PUSH_VAPID_SUBJECT.",
    );
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
  } catch {
    /* A mensagem da biblioteca não é repassada: algumas delas citam o valor
       recebido, e o destino desta é qualquer log que a capture. */
    throw new VapidConfigError(
      "vapid_invalid",
      "VAPID com formato inválido: as chaves precisam ser base64 URL-safe sem " +
        "'=', e o subject um mailto: ou https:.",
    );
  }

  /* A conferência que a biblioteca não faz. Com o par trocado, cada envio
     sairia assinado por uma chave que nenhuma subscription conhece, e o único
     sinal seria um 403 do push service — o mesmo número de uma dúzia de outros
     defeitos. Recusar aqui troca esse silêncio por um código que diz o que é. */
  if (!vapidPairMatches(publicKey, privateKey)) {
    throw new VapidConfigError(
      "vapid_mismatch",
      "VAPID inconsistente: WEB_PUSH_VAPID_PRIVATE_KEY não é a chave privada de " +
        "NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY.",
    );
  }

  configurado = true;
}

/** Lê um campo de um erro desconhecido sem assumir a classe dele. */
function campoDoErro(error: unknown, campo: "statusCode" | "body"): unknown {
  return typeof error === "object" && error !== null && campo in error
    ? (error as Record<string, unknown>)[campo]
    : undefined;
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
      errorCode:
        error instanceof VapidConfigError ? error.code : "vapid_invalid",
    };
  }

  try {
    const resposta = await webpush.sendNotification(
      {
        endpoint: target.endpoint,
        keys: { p256dh: target.p256dh, auth: target.auth },
      },
      JSON.stringify(payload),
      { TTL: 60 * 60 * 12, timeout: TIMEOUT_MS },
    );

    return classifyPushStatus(resposta.statusCode);
  } catch (error) {
    const statusCode = campoDoErro(error, "statusCode");

    if (typeof statusCode === "number") {
      return classifyPushStatus(
        statusCode,
        pushServiceReason(campoDoErro(error, "body")),
      );
    }

    return { status: "failed", errorCode: "network" };
  }
};
