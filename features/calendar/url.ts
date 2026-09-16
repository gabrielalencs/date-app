import { toMonthParam, type CivilMonth } from "@/lib/datetime";

/**
 * Construção das URLs da agenda (D-078).
 *
 * Mês, dia e categoria moram na URL, e navegar é seguir um link — não apertar
 * um botão que muda estado de cliente. Centralizado aqui porque cada link da
 * tela precisa preservar os outros dois parâmetros, e espalhar essa montagem
 * por seis componentes é como um deles esquece a categoria.
 */
export const AGENDA_PATH = "/agenda";

export function agendaHref(params: {
  month: CivilMonth;
  day?: string | null;
  category?: string | null;
}): string {
  const query = new URLSearchParams();
  query.set("mes", toMonthParam(params.month));

  if (params.day) query.set("dia", params.day);
  if (params.category) query.set("categoria", params.category);

  return `${AGENDA_PATH}?${query.toString()}`;
}
