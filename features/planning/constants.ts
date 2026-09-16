/**
 * Tetos de usabilidade, não invariantes de correção.
 *
 * Vivem na aplicação pelo mesmo motivo do D-065: virar constraint significaria
 * migration para mudar de ideia, e "quantos itens cabem numa lista" é
 * exatamente o tipo de número sobre o qual se muda de ideia.
 *
 * O contraste continua sendo o índice único de `is_confirmed` e o único de
 * `plan_id` em `reservations` — dois estados impossíveis, e por isso no banco.
 */
export const MAX_CHECKLIST_ITEMS = 50;

export const MAX_EXPENSES_PER_PLAN = 100;

/** Rótulos do estado da reserva. Sem ícone e sem emoji. */
export const RESERVATION_LABELS = {
  pending: "A confirmar",
  confirmed: "Confirmada",
  cancelled: "Sem reserva",
} as const;
