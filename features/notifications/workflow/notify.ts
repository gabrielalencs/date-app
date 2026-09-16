import { sleep } from "workflow";

import {
  processIntent,
  readIntentSchedule,
} from "@/features/notifications/workflow/steps";

/**
 * O scheduler do B11.5 (seção 4.3 do docs/NOTIFICATIONS.md).
 *
 * O input durável é **só o `intentId`**. Nada de título, de subscription ou de
 * dado privado: o payload de um run fica gravado no log de eventos da
 * plataforma, e o que não é gravado não vaza. Tudo o mais é lido do banco no
 * instante do envio — que é, aliás, a mesma razão pela qual a notificação
 * consegue ser verdadeira.
 *
 * O laço existe por causa do debounce: enquanto a pessoa continua sugerindo
 * datas, a mutation empurra o `due_at` para frente na mesma linha. O workflow
 * acorda, descobre que ainda não é hora, e volta a dormir. O teto de cinco
 * voltas é o que impede uma intent patológica de virar um run imortal.
 */
const MAX_ESPERAS = 5;

export async function notifyWorkflow(intentId: string): Promise<void> {
  "use workflow";

  for (let volta = 0; volta < MAX_ESPERAS; volta += 1) {
    /* A decisão de dormir é tomada **dentro do step**, não aqui: comparar o
       relógio no corpo do workflow tornaria o replay não determinístico, porque
       a segunda execução leria outro instante. O step grava o veredito no log
       de eventos, e o replay lê de lá. */
    const agenda = await readIntentSchedule(intentId);

    if (agenda.action === "stop") return;

    if (agenda.action === "wait") {
      await sleep(new Date(agenda.dueAtIso));
      continue;
    }

    const resultado = await processIntent(intentId);

    /* `retry` é a intent que voltou para `pending` porque o `due_at` andou
       enquanto o step rodava. Qualquer outro desfecho encerra o run. */
    if (resultado !== "retry") return;
  }
}
