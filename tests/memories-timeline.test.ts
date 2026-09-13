import { describe, expect, it } from "vitest";

import { MEMORIES_PER_PAGE } from "@/features/memories/constants";
import {
  FIRST_PAGE,
  groupByMonth,
  memoriesHref,
  pageOffset,
  parsePageParam,
} from "@/features/memories/timeline";
import { fromCivil, monthOf, startOfDayInApp } from "@/lib/datetime";

/**
 * O agrupamento da timeline, nos três fusos (`pnpm test:tz`).
 *
 * O defeito que este arquivo existe para pegar não aparece em São Paulo, e é o
 * mesmo que o B7 provou no calendário: um date às 23:00 de 30 de setembro é
 * `2026-10-01T02:00Z`, e agrupado por UTC ele muda de mês. Metade dos dates
 * deste produto é noturna.
 */

/** Hora de parede em São Paulo, sem passar por UTC em lugar nenhum. */
function noDia(
  year: number,
  month: number,
  day: number,
  hour = 12,
  minute = 0,
): Date {
  return fromCivil({ year, month, day, hour, minute });
}

describe("groupByMonth agrupa pelo dia civil de São Paulo", () => {
  it("o date das 23:30 do último dia fica no mês dele, não no seguinte", () => {
    const virada = noDia(2026, 4, 30, 23, 30);
    const [grupo, ...resto] = groupByMonth([{ happenedAt: virada }]);

    expect(resto).toEqual([]);
    expect(grupo?.month).toEqual({ year: 2026, month: 4 });
    expect(grupo?.title).toBe("Abril de 2026");

    /* A prova de que o instante realmente cruza a meia-noite UTC: sem isso o
       teste passaria mesmo com o agrupamento errado, porque nenhuma data teria
       o que cruzar. */
    expect(virada.toISOString()).toBe("2026-05-01T02:30:00.000Z");
  });

  it("o mesmo na virada do ano", () => {
    const reveillon = noDia(2026, 12, 31, 23, 0);
    const [grupo] = groupByMonth([{ happenedAt: reveillon }]);

    expect(grupo?.month).toEqual({ year: 2026, month: 12 });
    expect(reveillon.toISOString()).toBe("2027-01-01T02:00:00.000Z");
  });

  it("a meia-noite do primeiro dia fica no mês que começa", () => {
    const primeiro = startOfDayInApp({ year: 2026, month: 5, day: 1 });
    const [grupo] = groupByMonth([{ happenedAt: primeiro }]);

    expect(grupo?.month).toEqual({ year: 2026, month: 5 });
  });

  it("separa meses e preserva a ordem que a consulta entregou", () => {
    const grupos = groupByMonth([
      { happenedAt: noDia(2026, 9, 20) },
      { happenedAt: noDia(2026, 9, 4) },
      { happenedAt: noDia(2026, 8, 30, 23, 30) },
      { happenedAt: noDia(2026, 8, 2) },
      { happenedAt: noDia(2025, 8, 2) },
    ]);

    expect(grupos.map((grupo) => grupo.title)).toEqual([
      "Setembro de 2026",
      "Agosto de 2026",
      "Agosto de 2025",
    ]);
    expect(grupos.map((grupo) => grupo.items.length)).toEqual([2, 2, 1]);
  });

  it("agosto de 2025 e agosto de 2026 não se juntam", () => {
    const grupos = groupByMonth([
      { happenedAt: noDia(2026, 8, 10) },
      { happenedAt: noDia(2025, 8, 10) },
    ]);

    expect(grupos).toHaveLength(2);
  });

  it("não reordena: quem ordena é o ORDER BY da consulta", () => {
    // Fora de ordem de propósito. Reordenar aqui criaria um segundo lugar onde
    // a ordem é decidida, e dois lugares divergem.
    const grupos = groupByMonth([
      { happenedAt: noDia(2026, 9, 4) },
      { happenedAt: noDia(2026, 9, 20) },
    ]);

    expect(grupos).toHaveLength(1);
    expect(grupos[0]?.items.map((item) => monthOf(item.happenedAt))).toEqual([
      { year: 2026, month: 9 },
      { year: 2026, month: 9 },
    ]);
  });

  it("lista vazia não produz grupo nenhum", () => {
    expect(groupByMonth([])).toEqual([]);
  });
});

describe("parsePageParam — URL ruim cai na primeira página, sem erro", () => {
  it("aceita inteiro positivo", () => {
    expect(parsePageParam("1")).toBe(1);
    expect(parsePageParam("2")).toBe(2);
    expect(parsePageParam(" 37 ")).toBe(37);
  });

  const recusados = [
    "0",
    "-1",
    "abc",
    "",
    " ",
    "1e3",
    "2.5",
    "01",
    "1,5",
    "٣",
    "9999999999999",
    "Infinity",
    "NaN",
    null,
    undefined,
  ];

  for (const bruto of recusados) {
    it(`"${String(bruto)}" vira a primeira página`, () => {
      expect(parsePageParam(bruto)).toBe(FIRST_PAGE);
    });
  }

  it("o teto de dígitos existe para o OFFSET caber no integer do Postgres", () => {
    // Sete dígitos passam; oito não. 9.999.999 páginas de 24 ainda cabem.
    expect(parsePageParam("9999999")).toBe(9_999_999);
    expect(parsePageParam("10000000")).toBe(FIRST_PAGE);
    expect(pageOffset(9_999_999, MEMORIES_PER_PAGE)).toBeLessThan(2_147_483_647);
  });
});

describe("pageOffset e memoriesHref", () => {
  it("a primeira página começa em zero", () => {
    expect(pageOffset(1, MEMORIES_PER_PAGE)).toBe(0);
    expect(pageOffset(2, MEMORIES_PER_PAGE)).toBe(MEMORIES_PER_PAGE);
    expect(pageOffset(3, 10)).toBe(20);
  });

  it("a primeira página não carrega parâmetro na URL", () => {
    expect(memoriesHref(1)).toBe("/memorias");
    expect(memoriesHref(0)).toBe("/memorias");
    expect(memoriesHref(2)).toBe("/memorias?pagina=2");
  });
});
