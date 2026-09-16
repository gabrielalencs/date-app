import type { NotificationKind } from "@/features/notifications/kinds";

/**
 * O contrato de envio, separado da implementação de propósito.
 *
 * A suíte de unidade injeta um remetente falso e mede a política inteira sem
 * um byte de rede; o workflow injeta o de verdade. Sem essa costura, provar
 * "uma subscription já enviada não recebe de novo" exigiria push externo, e um
 * teste que depende do serviço de push de outra empresa não é um teste.
 */

export type PushPayload = {
  title: string;
  body: string;
  /** Caminho interno, já montado pelo servidor. Nunca URL do payload. */
  url: string;
  kind: NotificationKind;
};

export type SendOutcome =
  | { status: "sent"; statusCode: number }
  /** 404/410: o navegador não existe mais. */
  | { status: "stale"; statusCode: number }
  /** 429/5xx ou erro de configuração: não encosta em subscription saudável. */
  | { status: "failed"; statusCode?: number; errorCode: string };

export type PushTarget = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type PushSender = (
  target: PushTarget,
  payload: PushPayload,
) => Promise<SendOutcome>;

/**
 * Classifica a resposta do push service.
 *
 * Pura, porque é a regra que mais importa e a que não pode ser verificada em
 * produção: confundir 429 com 410 apaga a subscription de quem só estava sendo
 * limitado, e a pessoa para de receber notificação para sempre sem ninguém
 * perceber.
 */
export function classifyPushStatus(statusCode: number): SendOutcome {
  if (statusCode >= 200 && statusCode < 300) {
    return { status: "sent", statusCode };
  }

  if (statusCode === 404 || statusCode === 410) {
    return { status: "stale", statusCode };
  }

  return {
    status: "failed",
    statusCode,
    errorCode: statusCode === 429 ? "rate_limited" : `http_${statusCode}`,
  };
}
