import {
  formatMonthTitle,
  isSameCivilMonth,
  monthOf,
  type CivilMonth,
} from "@/lib/datetime";

/**
 * Agrupamento da timeline por mês (seção 6 do docs/MEMORIES.md).
 *
 * Função pura, sem banco: é o que permite provar a virada de mês num teste que
 * roda também em `TZ=UTC`, sem subir servidor.
 *
 * **Nenhuma função de data nova.** `monthOf`, `isSameCivilMonth` e
 * `formatMonthTitle` já existem desde o B7, e a zona do ESLint garante que
 * nada escape por fora. Se isso parecer redundante, lembre do que o B7 provou:
 * um date às 23:00 de 30 de setembro é `2026-10-01T02:00Z`, e agrupado por UTC
 * ele muda de mês. A timeline erraria o mês de metade dos dates noturnos.
 */
export type MonthGroup<T> = {
  month: CivilMonth;
  /** "Setembro de 2026", em Fraunces no cabeçalho. */
  title: string;
  items: T[];
};

/**
 * Agrupa preservando a ordem recebida.
 *
 * A lista já chega do mais recente para o mais antigo, então basta abrir um
 * grupo novo quando o mês civil muda — sem ordenar de novo, e sem `Map` com
 * chave de string, que é onde um `yyyy-MM` montado à mão entraria pela porta
 * dos fundos.
 */
export function groupByCivilMonth<T>(
  items: readonly T[],
  instantOf: (item: T) => Date,
): MonthGroup<T>[] {
  const grupos: MonthGroup<T>[] = [];

  for (const item of items) {
    const month = monthOf(instantOf(item));
    const ultimo = grupos.at(-1);

    if (ultimo && isSameCivilMonth(ultimo.month, month)) {
      ultimo.items.push(item);
      continue;
    }

    grupos.push({ month, title: formatMonthTitle(month), items: [item] });
  }

  return grupos;
}
