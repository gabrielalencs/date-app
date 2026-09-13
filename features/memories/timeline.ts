import {
  formatMonthTitle,
  isSameCivilMonth,
  monthOf,
  type CivilMonth,
} from "@/lib/datetime";

/**
 * A aritmética da timeline: agrupar por mês e paginar. Pura, sem banco.
 *
 * **Este bloco não inventa nenhuma função de data.** `monthOf` e
 * `formatMonthTitle` já existem desde o B7, e a zona do ESLint (D-073) garante
 * que nada escape por fora.
 *
 * Se isso parecer redundante, lembre do que o B7 provou: um date às 23:00 de
 * 30 de setembro é `2026-10-01T02:00Z`, e agrupado por UTC ele muda de mês. A
 * timeline erraria o mês de metade dos dates noturnos.
 */

/** O mínimo que o agrupamento precisa saber de uma memória. */
export type HasHappenedAt = { happenedAt: Date };

export type MonthGroup<T extends HasHappenedAt> = {
  month: CivilMonth;
  /** "Setembro de 2026", em Fraunces no cabeçalho. */
  title: string;
  items: T[];
};

/**
 * Agrupa em meses civis **preservando a ordem recebida**.
 *
 * Não ordena: quem ordena é o `ORDER BY` da consulta, e reordenar aqui criaria
 * um segundo lugar onde a ordem é decidida — dois lugares divergem.
 *
 * Um mês cortado pela paginação reaparece com o mesmo cabeçalho na página
 * seguinte, e isso é correto: a página é um recorte da lista, não um capítulo.
 */
export function groupByMonth<T extends HasHappenedAt>(
  items: readonly T[],
): MonthGroup<T>[] {
  const grupos: MonthGroup<T>[] = [];

  for (const item of items) {
    const mes = monthOf(item.happenedAt);
    const ultimo = grupos[grupos.length - 1];

    if (ultimo && isSameCivilMonth(ultimo.month, mes)) {
      ultimo.items.push(item);
      continue;
    }

    grupos.push({ month: mes, title: formatMonthTitle(mes), items: [item] });
  }

  return grupos;
}

/** Página 1 é a primeira. Nada de página zero na URL de gente. */
export const FIRST_PAGE = 1;

const INTEIRO_POSITIVO = /^[1-9]\d{0,6}$/;

/**
 * `?pagina=2` → 2. Qualquer outra coisa → a primeira página.
 *
 * Devolve valor em vez de lançar pela mesma razão do `parseMonthParam` do B7
 * (D-078): quem chama é uma URL, e URL ruim não é erro do produto — é alguém
 * editando a barra de endereços, um link velho ou um robô. `0`, `-1`, `abc`,
 * `1e3` e `2.5` caem todos na primeira página, sem tela de erro.
 *
 * O teto de sete dígitos existe para `?pagina=99999999999` não virar um
 * `OFFSET` absurdo: a consulta responderia vazio de qualquer jeito, mas com um
 * número que não cabe no `integer` do Postgres ela viraria erro de driver.
 */
export function parsePageParam(raw: string | null | undefined): number {
  const texto = raw?.trim() ?? "";

  if (!INTEIRO_POSITIVO.test(texto)) {
    return FIRST_PAGE;
  }

  return Number(texto);
}

/** `OFFSET` da página, em linhas. */
export function pageOffset(page: number, pageSize: number): number {
  return (page - FIRST_PAGE) * pageSize;
}

/** `/memorias`, `/memorias?pagina=3`. A primeira página não carrega parâmetro. */
export function memoriesHref(page: number): string {
  return page <= FIRST_PAGE ? "/memorias" : `/memorias?pagina=${page}`;
}
