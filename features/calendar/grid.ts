import {
  addCivilDays,
  civilDateOf,
  civilDayCount,
  civilDayKey,
  dayKey,
  isInMonth,
  monthGrid,
  MONTH_GRID_CELLS,
  startOfDayInApp,
  type CivilDate,
  type CivilMonth,
} from "@/lib/datetime";
import type { PlanStatus } from "@/lib/status";

/**
 * Agrupamento da grade do mês. Função pura, **separada da consulta** (seção 4
 * do docs/CALENDAR.md): recebe o mês e a lista de entradas, devolve as 42
 * células. É isto que os testes de fuso atacam, sem banco.
 *
 * O agrupamento é por `dayKey`, e só por `dayKey` (D-073). Um date às 23:00 de
 * 30 de setembro é 2026-10-01T02:00Z: agrupado por UTC ele aparece em 1º de
 * outubro, e a maior parte dos dates deste produto é à noite.
 */

/** O que a célula e o painel precisam saber de uma opção de data. */
export type CalendarEntry = {
  optionId: string;
  planId: string;
  planTitle: string;
  planStatus: PlanStatus;
  category: string | null;
  coverMediaId: string | null;
  startsAt: Date;
  /** Meia-noite do último dia civil, quando o rolê ocupa mais de um dia. */
  endsAt: Date | null;
  allDay: boolean;
  isConfirmed: boolean;
};

/**
 * A mesma opção aparece em cada dia que ela ocupa, e cada aparição sabe qual
 * das duas coisas ela é.
 *
 * Sem `dayIndex`, uma viagem de três dias mostraria "19:00" nos três — o
 * horário de embarque repetido como se fosse o programa de domingo. Com ele, a
 * célula diz "dia 2 de 3" e guarda o horário para onde ele é verdade.
 */
export type CalendarPlacement = CalendarEntry & {
  /** 1 no primeiro dia do rolê. */
  dayIndex: number;
  dayCount: number;
};

export type CalendarCell = {
  date: CivilDate;
  /** `yyyy-MM-dd`. É a chave do agrupamento e o valor de `?dia=`. */
  key: string;
  /** Dias de meses vizinhos aparecem apagados, com conteúdo real. */
  inMonth: boolean;
  isToday: boolean;
  entries: CalendarPlacement[];
};

/**
 * A janela da consulta, semiaberta (D-075).
 *
 * Da meia-noite da primeira célula à meia-noite do dia **seguinte** à última,
 * as duas por `startOfDayInApp`. Com `Date.UTC` no lugar, a janela começaria
 * três horas cedo demais: traria um date do dia anterior às 21h como se fosse
 * da primeira célula e perderia o da última célula depois das 21h.
 *
 * Semiaberta porque o fim é uma meia-noite, e meia-noite pertence ao dia que
 * começa — `>= inicio and < fim`, nunca `<=`.
 */
/**
 * Teto de dias de um rolê, só para o agrupamento.
 *
 * Não é regra de produto: é o limite de quantas células a grade tem. Um
 * `ends_at` absurdo — de um bug futuro ou de um dado colado à mão — não pode
 * fazer este laço percorrer anos de dias civis.
 */
const MAX_DIAS_POR_ENTRADA = MONTH_GRID_CELLS;

export function monthWindow(month: CivilMonth): { start: Date; end: Date } {
  const celulas = monthGrid(month);
  const primeira = celulas[0]!;
  const ultima = celulas[celulas.length - 1]!;

  return {
    start: startOfDayInApp(primeira),
    end: startOfDayInApp(addCivilDays(ultima, 1)),
  };
}

/**
 * As 42 células do mês, cada uma com as entradas que caem naquele dia civil.
 *
 * `now` desce de fora — do servidor, como no B6 — em vez de sair de um
 * `new Date()` aqui dentro: a célula de "hoje" precisa ser a mesma no HTML do
 * servidor e na hidratação (D-078).
 */
export function buildMonthCells(input: {
  month: CivilMonth;
  entries: readonly CalendarEntry[];
  now: Date;
}): CalendarCell[] {
  const { month, entries, now } = input;

  const porDia = new Map<string, CalendarPlacement[]>();
  for (const entrada of entries) {
    /* Um rolê de vários dias ocupa **cada** um deles. Agrupado só pelo começo,
       uma viagem de sexta a domingo deixaria sábado e domingo em branco no
       calendário — e um dia em branco na agenda é um convite para marcar outra
       coisa em cima. */
    const dias = entrada.endsAt
      ? Math.min(civilDayCount(entrada.startsAt, entrada.endsAt), MAX_DIAS_POR_ENTRADA)
      : 1;

    let civil = civilDateOf(entrada.startsAt);
    for (let i = 0; i < dias; i += 1) {
      const chave = civilDayKey(civil);
      const lista = porDia.get(chave) ?? [];
      lista.push({ ...entrada, dayIndex: i + 1, dayCount: dias });
      porDia.set(chave, lista);
      civil = addCivilDays(civil, 1);
    }
  }

  const hoje = dayKey(now);

  return monthGrid(month).map((date): CalendarCell => {
    const key = civilDayKey(date);

    /* Confirmada primeiro, depois a mais cedo. É a mesma ordem da lista de
       opções do plano (D-085), reduzida ao que a célula distingue: aqui não há
       consenso a mostrar, só qual date já é oficial. */
    const doDia = [...(porDia.get(key) ?? [])].sort((a, b) => {
      if (a.isConfirmed !== b.isConfirmed) return a.isConfirmed ? -1 : 1;
      return a.startsAt.getTime() - b.startsAt.getTime();
    });

    return {
      date,
      key,
      inMonth: isInMonth(date, month),
      isToday: key === hoje,
      entries: doDia,
    };
  });
}

/** As entradas de um dia específico da grade, para o painel. */
export function entriesOfDay(
  cells: readonly CalendarCell[],
  dayKeyWanted: string | null,
): CalendarCell | null {
  if (!dayKeyWanted) return null;
  return cells.find((cell) => cell.key === dayKeyWanted) ?? null;
}

/**
 * Nome acessível da célula: `"14 de setembro, 2 planos, 1 confirmado"`.
 *
 * "14" sozinho não diz nada fora do contexto visual (seção 10), e o leitor de
 * tela não vê a coluna em que a célula está.
 */
export function cellAccessibleName(
  cell: CalendarCell,
  dayLabel: string,
): string {
  const total = cell.entries.length;
  if (total === 0) return dayLabel;

  const confirmados = cell.entries.filter((e) => e.isConfirmed).length;
  const planos = total === 1 ? "1 plano" : `${total} planos`;

  if (confirmados === 0) return `${dayLabel}, ${planos}`;

  const oficiais =
    confirmados === 1 ? "1 confirmado" : `${confirmados} confirmados`;

  return `${dayLabel}, ${planos}, ${oficiais}`;
}
