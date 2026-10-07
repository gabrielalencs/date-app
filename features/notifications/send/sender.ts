import type { NotificationKind } from "@/features/notifications/kinds";

/**
 * O contrato de envio, separado da implementação de propósito.
 *
 * A suíte de unidade injeta um remetente falso e mede a política inteira sem
 * um byte de rede; o workflow injeta o de verdade. Sem essa costura, provar
 * "uma subscription já enviada não recebe de novo" exigiria push externo, e um
 * teste que depende do serviço de push de outra empresa não é um teste.
 */

/**
 * O `kind` do envio de teste do Perfil (D-181). Fica fora de
 * `NOTIFICATION_KINDS` de propósito: não é intent, não passa por revalidação e
 * nunca vai para a outra pessoa. O Service Worker só o usa para montar a `tag`.
 */
export const TEST_PUSH_KIND = "push_test";

export type PushPayload = {
  title: string;
  body: string;
  /** Caminho interno, já montado pelo servidor. Nunca URL do payload. */
  url: string;
  kind: NotificationKind | typeof TEST_PUSH_KIND;
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
 *
 * `reason` é o motivo que o próprio push service escreveu na recusa, quando ele
 * escreve um (D-181). Entra no `errorCode` porque um `http_403` sozinho não
 * distingue chave VAPID trocada de JWT malformado, e essa é exatamente a
 * pergunta que o diagnóstico precisa responder.
 */
export function classifyPushStatus(
  statusCode: number,
  reason?: string,
): SendOutcome {
  if (statusCode >= 200 && statusCode < 300) {
    return { status: "sent", statusCode };
  }

  if (statusCode === 404 || statusCode === 410) {
    return { status: "stale", statusCode };
  }

  const codigo = statusCode === 429 ? "rate_limited" : `http_${statusCode}`;

  return {
    status: "failed",
    statusCode,
    errorCode: reason ? `${codigo}:${reason}` : codigo,
  };
}

/**
 * O motivo da recusa, extraído do corpo da resposta do push service.
 *
 * A Apple responde JSON — `{"reason":"BadJwtToken"}`, `VapidPkHashMismatch` — e
 * o FCM costuma responder uma palavra só. Os dois cabem na mesma regra: só sai
 * daqui um identificador curto de letras. Qualquer outra coisa é descartada,
 * porque o corpo é texto de terceiro e o destino dele é uma coluna de banco: um
 * corpo que ecoasse o endpoint gravaria credencial de entrega no diagnóstico.
 */
export function pushServiceReason(body: unknown): string | undefined {
  if (typeof body !== "string" || body.length === 0 || body.length > 2000) {
    return undefined;
  }

  const identificador = /^[A-Za-z]{1,48}$/;
  const texto = body.trim();

  if (identificador.test(texto)) return texto;

  try {
    const json: unknown = JSON.parse(texto);
    if (json && typeof json === "object" && "reason" in json) {
      const reason = (json as { reason: unknown }).reason;
      if (typeof reason === "string" && identificador.test(reason)) {
        return reason;
      }
    }
  } catch {
    /* Corpo que não é JSON nem identificador: HTML de erro, frase longa. Não
       serve de código e não vale o risco de guardar. */
  }

  return undefined;
}
