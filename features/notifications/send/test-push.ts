import {
  TEST_PUSH_KIND,
  type PushPayload,
  type SendOutcome,
} from "@/features/notifications/send/sender";

/**
 * O envio de teste do Perfil (D-181).
 *
 * Existe porque "este aparelho está recebendo notificações" era, até aqui, uma
 * afirmação que ninguém conferia: o navegador diz que está inscrito, o servidor
 * diz que agendou, e entre os dois há a chave VAPID, o push service da Apple ou
 * do Google e as notificações do sistema — três lugares onde o push pode morrer
 * sem deixar rastro na tela. O teste atravessa os três, na hora, e devolve o
 * que o push service respondeu.
 *
 * Não é notificação de produto. Não tem intent, não passa por revalidação, não
 * respeita janela silenciosa e nunca sai do aparelho de quem tocou no botão: a
 * regra "notificar o estado estável, não o clique" é sobre avisar a outra
 * pessoa, e aqui a única pessoa é quem pediu.
 */

/** Nada privado: a frase é a mesma para qualquer pessoa, em qualquer modo. */
export const TEST_PUSH_PAYLOAD: PushPayload = {
  title: "Notificações funcionando",
  body: "É assim que os avisos do DATE vão aparecer neste aparelho.",
  url: "/perfil",
  kind: TEST_PUSH_KIND,
};

export type TestPushState =
  | { ok: true }
  | {
      ok: false;
      /** O que a tela precisa saber para dizer à pessoa o que fazer. */
      motivo:
        "sem-registro" | "expirada" | "servidor" | "recusada" | "indisponivel";
      /** O código cru, para quem for diagnosticar. Nunca carrega endpoint nem chave. */
      codigo?: string;
    };

/**
 * Do desfecho do envio para a resposta da tela. Pura, para caber na suíte de
 * unidade: é aqui que mora a distinção entre "o problema é o servidor" e "o
 * problema é este aparelho", que é a única coisa que a pessoa precisa saber.
 */
export function testPushStateFor(resultado: SendOutcome): TestPushState {
  if (resultado.status === "sent") return { ok: true };

  if (resultado.status === "stale") {
    return {
      ok: false,
      motivo: "expirada",
      codigo: `http_${resultado.statusCode}`,
    };
  }

  /* Configuração do servidor: nada que a pessoa faça no aparelho resolve. */
  if (resultado.errorCode.startsWith("vapid_")) {
    return { ok: false, motivo: "servidor", codigo: resultado.errorCode };
  }

  /* 400, 401 e 403 são o push service recusando a assinatura ou a inscrição —
     o caso típico é uma subscription feita com outra chave VAPID. */
  const status = resultado.statusCode;
  if (status === 400 || status === 401 || status === 403) {
    return { ok: false, motivo: "recusada", codigo: resultado.errorCode };
  }

  return { ok: false, motivo: "indisponivel", codigo: resultado.errorCode };
}
