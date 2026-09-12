import { allowedTransitions } from "@/lib/plan-status";
import type { PlanStatus } from "@/lib/status";

/**
 * Pré-condições de status: o ponto de arquitetura do B8.
 *
 * > Um status só é alcançável quando o fato que ele afirma existe.
 * > E transição manual não desfaz fato de domínio.
 *
 * `lib/plan-status.ts` continua puro e continua sem conhecer o mundo: ele sabe
 * que `planned → reserved` existe no grafo. Este módulo sabe que ela só é
 * alcançável quando há reserva confirmada — e continua puro também, porque
 * recebe os fatos prontos em vez de ir buscá-los.
 *
 * É **um lugar só**, consultado **duas vezes** (seção 4 do docs/PLANNING.md):
 *
 * 1. pela interface, para decidir quais botões existem;
 * 2. dentro da transação da mutation, de novo, antes de escrever.
 *
 * As duas, não uma. A interface que não pergunta oferece um botão que falha; a
 * mutation que não pergunta confia no frontend, e o frontend nunca é fonte de
 * autoridade (CLAUDE.md).
 */

/** O que o plano afirma sobre o mundo, lido do banco pela camada de dados. */
export type PlanFacts = {
  hasConfirmedDate: boolean;
  hasConfirmedReservation: boolean;
};

export const NO_CONFIRMED_DATE =
  "Confirme uma das datas antes de marcar o plano como planejado.";

export const NO_CONFIRMED_RESERVATION =
  "Confirme a reserva antes de marcar o plano como reservado.";

/**
 * A mensagem que substitui a do B6.
 *
 * Antes, `unconfirmDateOption` recusava em `reserved` dizendo "Volte para
 * Planejado antes de desmarcar a data" — e aquele caminho deixou de existir,
 * porque voltar para planejado agora é recusado enquanto houver reserva
 * confirmada. A ordem é de fora para dentro: desfaz a reserva, o plano volta
 * sozinho, e só então a data se desmarca.
 */
export const RESERVATION_HOLDS_PLAN =
  "Esse plano tem reserva. Desfaça a reserva antes de mudar a data.";

/**
 * `null` quando a transição pode acontecer; a mensagem do impedimento quando
 * não pode. Pressupõe que a transição já existe no grafo.
 */
export function transitionBlock(
  from: PlanStatus,
  to: PlanStatus,
  facts: PlanFacts,
): string | null {
  // Do B6: planejado sem data confirmada é um estado que mente (D-063).
  if (from === "deciding" && to === "planned" && !facts.hasConfirmedDate) {
    return NO_CONFIRMED_DATE;
  }

  // Reservado sem reserva confirmada mente do mesmo jeito.
  if (
    from === "planned" &&
    to === "reserved" &&
    !facts.hasConfirmedReservation
  ) {
    return NO_CONFIRMED_RESERVATION;
  }

  /* A que fecha o loop: quem desfaz reserva é a reserva, não o botão de status.
     Sem isto, o botão "Planejado" seria um caminho de volta que deixa a reserva
     confirmada pendurada num plano que não está mais reservado. */
  if (
    from === "reserved" &&
    to === "planned" &&
    facts.hasConfirmedReservation
  ) {
    return RESERVATION_HOLDS_PLAN;
  }

  return null;
}

/**
 * As transições que a interface pode oferecer: as do grafo, menos as que os
 * fatos bloqueiam. É a **primeira** das duas consultas.
 */
export function offerableTransitions(
  from: PlanStatus,
  facts: PlanFacts,
): readonly PlanStatus[] {
  return allowedTransitions(from).filter(
    (to) => transitionBlock(from, to, facts) === null,
  );
}
