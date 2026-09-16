import {
  claimIntent,
  finishIntent,
  loadActiveSubscriptions,
  loadActorName,
  loadPlanFacts,
  loadRecipientPreferences,
  readIntent,
  recordDeliveryResult,
  reserveDelivery,
} from "@/features/notifications/data/system";
import { preferenceGateFor } from "@/features/notifications/policy/recipients";
import { deepLinkFor } from "@/features/notifications/policy/links";
import { shouldSend } from "@/features/notifications/policy/revalidate";
import { webPushSender } from "@/features/notifications/send/web-push-sender";
import type { PushSender } from "@/features/notifications/send/sender";
import {
  renderNotification,
  type TemplateFacts,
} from "@/features/notifications/templates";
import { formatDay, formatWeekday } from "@/lib/datetime";

/**
 * Os steps do workflow. Cada um é uma unidade durável com retry próprio.
 *
 * `processIntent` concentra o que precisa acontecer uma vez só, e a ordem
 * importa: **claim primeiro**. Reler o estado antes de tomar posse deixaria
 * duas execuções concorrentes lerem os mesmos fatos e enviarem as duas.
 */

export type ScheduleDecision =
  | { action: "stop" }
  | { action: "wait"; dueAtIso: string }
  | { action: "process" };

/**
 * Ainda vale acordar?
 *
 * O veredito é calculado aqui, dentro do step, e fica gravado no log de eventos
 * do run. O corpo do workflow só lê o que este step decidiu — é assim que o
 * replay chega ao mesmo lugar duas vezes.
 */
export async function readIntentSchedule(
  intentId: string,
): Promise<ScheduleDecision> {
  "use step";

  const intent = await readIntent(intentId);

  /* Já resolvida por outro caminho — cancelada pela mutation, enviada pelo
     recovery, suprimida numa volta anterior. Não há o que fazer. */
  if (!intent || intent.status !== "pending") {
    return { action: "stop" };
  }

  /* Meio segundo de folga: acordar exatamente no milissegundo do `due_at` e
     achar que ainda falta tempo geraria uma volta inútil no laço. */
  if (intent.dueAt.getTime() > Date.now() + 500) {
    return { action: "wait", dueAtIso: intent.dueAt.toISOString() };
  }

  return { action: "process" };
}

export type ProcessResult = "sent" | "suppressed" | "skipped" | "retry";

/**
 * O envio, com a revalidação no meio.
 *
 * A sequência é a tese do bloco: toma posse → relê os fatos **de agora** →
 * pergunta à política se a afirmação sobrevive → só então renderiza texto. Uma
 * intent criada quando o plano estava ativo e encontrada com o plano arquivado
 * vira `suppressed`, e o telefone da outra pessoa não mente.
 */
export async function processIntent(
  intentId: string,
  sender: PushSender = webPushSender,
): Promise<ProcessResult> {
  "use step";

  const intent = await claimIntent(intentId);

  /* Outra execução levou o claim, ou a intent já não estava pendente. Sair sem
     enviar é o comportamento correto: quem tem a posse resolve. */
  if (!intent) return "skipped";

  try {
    /* O `due_at` pode ter andado entre o despertar e o claim — é o debounce
       empurrando a janela. Devolve para `pending` e pede outra volta. */
    if (intent.dueAt.getTime() > Date.now() + 500) {
      await finishIntent(intentId, "pending");
      return "retry";
    }

    const facts = await loadPlanFacts(intent);
    const veredito = shouldSend(intent.kind, intent.expected, facts);

    if (!veredito.send) {
      await finishIntent(intentId, "suppressed", veredito.reason);
      return "suppressed";
    }

    const prefs = await loadRecipientPreferences(intent);
    const portao = preferenceGateFor(intent.kind);

    /* Preferência desligada não é falha e não é supressão de estado: é a pessoa
       tendo dito que não quer. O desfecho é `suppressed` com o motivo escrito. */
    if (!prefs.pushEnabled || !prefs[portao]) {
      await finishIntent(intentId, "suppressed", "preferência desligada");
      return "suppressed";
    }

    const subscriptions = await loadActiveSubscriptions(intent);
    if (subscriptions.length === 0) {
      await finishIntent(intentId, "suppressed", "sem dispositivo ativo");
      return "suppressed";
    }

    const templateFacts: TemplateFacts = {
      actorName: await loadActorName(intent),
      planTitle: facts.title,
      /* "sábado, 14 de junho" — minúsculo porque entra no meio da frase, e
         montado com as funções de `lib/datetime.ts` em vez de um `Intl` novo:
         formatação de data neste projeto tem dono único (D-073). */
      dateLabel: facts.confirmedStartsAt
        ? `${formatWeekday(facts.confirmedStartsAt).toLowerCase()}, ` +
          `${formatDay(facts.confirmedStartsAt, new Date())}`
        : undefined,
      optionCount: facts.actorOpenOptionCount,
      vote: facts.actorVote ?? undefined,
      reservationStatus: facts.reservationStatus ?? undefined,
      offsetDays: intent.expected.offsetDays,
    };

    const copy = renderNotification({
      kind: intent.kind,
      facts: templateFacts,
      previewMode: prefs.previewMode,
      seed: intent.id,
    });

    const payload = {
      ...copy,
      url: deepLinkFor({ kind: intent.kind, planId: intent.planId }),
      kind: intent.kind,
    };

    let algumEnviou = false;
    let algumFalhou = false;

    for (const subscription of subscriptions) {
      /* A reserva é o que torna o step idempotente: se ele já rodou e o
         Workflow o repetiu, o insert colide com o único e devolve `false`.
         Aquele navegador não recebe duas vezes. */
      const novo = await reserveDelivery(intent, subscription.id);
      if (!novo) {
        algumEnviou = true;
        continue;
      }

      const resultado = await sender(subscription, payload);
      await recordDeliveryResult(intent, subscription.id, {
        status: resultado.status,
        statusCode:
          "statusCode" in resultado ? resultado.statusCode : undefined,
        errorCode:
          resultado.status === "failed" ? resultado.errorCode : undefined,
      });

      if (resultado.status === "sent") algumEnviou = true;
      if (resultado.status === "failed") algumFalhou = true;
    }

    if (algumEnviou) {
      await finishIntent(intentId, "sent");
      return "sent";
    }

    /* Nenhum dispositivo aceitou. Se houve falha temporária, o desfecho é
       `failed` e o recovery não reenvia — a delivery já está registrada e o
       único impede duplicata. Se todos estavam stale, não há a quem enviar. */
    await finishIntent(
      intentId,
      algumFalhou ? "failed" : "suppressed",
      algumFalhou ? "nenhuma entrega aceita" : "todos os dispositivos stale",
    );
    return algumFalhou ? "skipped" : "suppressed";
  } catch (error) {
    /* Falha inesperada não pode deixar a intent presa em `processing` para
       sempre: volta para `pending` e o recovery tenta de novo. */
    await finishIntent(
      intentId,
      "pending",
      error instanceof Error ? error.name : "unknown",
    );
    throw error;
  }
}
