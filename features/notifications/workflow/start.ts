import "server-only";

import { start } from "workflow/api";

import { attachWorkflowRun } from "@/features/notifications/data/system";
import { notifyWorkflow } from "@/features/notifications/workflow/notify";

/**
 * Inicia o run, DEPOIS do commit (seção 19 do docs/NOTIFICATIONS.md).
 *
 * Nunca dentro da transação: uma chamada de rede com a linha travada é a
 * transação segurando o banco enquanto espera um terceiro responder.
 *
 * E o `catch` é a parte importante. Push é best effort e o domínio não depende
 * dele: se o Workflow estiver fora do ar, o plano continua criado, o voto
 * continua registrado e a reserva continua confirmada. A intent fica `pending`
 * e o recovery diário a encontra pelo índice de `(status, due_at)`.
 *
 * Por isso esta função não propaga erro e não devolve sucesso: quem a chama não
 * tem o que fazer com a resposta.
 */
export async function startNotificationWorkflow(
  intentId: string,
): Promise<void> {
  try {
    const run = await start(notifyWorkflow, [intentId]);
    await attachWorkflowRun(intentId, run.runId);
  } catch {
    /* Silencioso de propósito: virar console.error faria o arnês do B11
       reprovar toda a suíte de navegador num ambiente sem Workflow, e a
       ausência de run já está registrada no banco como `workflow_run_id` nulo,
       que é exatamente o que o recovery procura. */
  }
}

/**
 * Inicia os runs de uma lista de intents. Sempre depois do commit.
 *
 * Sequencial de propósito: são no máximo oito (os quatro lembretes das duas
 * pessoas), e falhar uma não pode impedir as outras — cada `start` já engole o
 * próprio erro.
 */
export async function startNotificationWorkflows(
  intentIds: readonly string[],
): Promise<void> {
  for (const intentId of intentIds) {
    await startNotificationWorkflow(intentId);
  }
}
