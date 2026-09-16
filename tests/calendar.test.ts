import { describe, expect, it } from "vitest";

import {
  buildMonthCells,
  cellAccessibleName,
  entriesOfDay,
  monthWindow,
  type CalendarEntry,
} from "@/features/calendar/grid";
import {
  addCivilDays,
  addMonths,
  civilDayKey,
  dayKey,
  formatMonthTitle,
  isInMonth,
  monthGrid,
  MONTH_GRID_CELLS,
  monthOf,
  parseDayParam,
  parseMonthParam,
  startOfDayInApp,
  toMonthParam,
  weekdayIndex,
  WEEKDAY_HEADERS,
  type CivilMonth,
} from "@/lib/datetime";

/**
 * Suíte do calendário. Roda em `TZ=UTC`, `TZ=America/New_York` e no fuso local
 * pelo `pnpm test:tz` (D-060).
 *
 * Nada aqui usa leitor de `Date` direto nem recorte de ISO: a zona do D-073
 * vale para este arquivo igual a qualquer outro, de propósito. Um teste que
 * precisasse escapar da zona para se escrever estaria provando a coisa errada.
 */

const SETEMBRO: CivilMonth = { year: 2026, month: 9 };

function entrada(
  over: Partial<CalendarEntry> & { startsAt: Date },
): CalendarEntry {
  return {
    optionId: "opt",
    planId: "plan",
    planTitle: "Jantar na cantina",
    planStatus: "deciding",
    category: "gastronomia",
    coverMediaId: null,
    allDay: false,
    isConfirmed: false,
    ...over,
  };
}

describe("weekdayIndex — segunda é 0 (D-072)", () => {
  it("mapeia a semana inteira a partir de uma segunda conhecida", () => {
    // 2026-09-07 é uma segunda-feira.
    const segunda = { year: 2026, month: 9, day: 7 };

    expect(weekdayIndex(segunda)).toBe(0);
    expect(weekdayIndex(addCivilDays(segunda, 1))).toBe(1);
    expect(weekdayIndex(addCivilDays(segunda, 5))).toBe(5);
    expect(weekdayIndex(addCivilDays(segunda, 6))).toBe(6);
    expect(weekdayIndex(addCivilDays(segunda, 7))).toBe(0);
  });

  it("domingo é 6, não 0 — que é o erro de um dia que getDay() cru produz", () => {
    // 2026-02-01 é um domingo, e fevereiro de 2026 começa nele.
    expect(weekdayIndex({ year: 2026, month: 2, day: 1 })).toBe(6);
  });

  it("os cabeçalhos estão na ordem do índice", () => {
    expect(WEEKDAY_HEADERS).toHaveLength(7);
    expect(WEEKDAY_HEADERS[0]!.short).toBe("Seg");
    expect(WEEKDAY_HEADERS[6]!.short).toBe("Dom");
    expect(WEEKDAY_HEADERS[6]!.long).toBe("Domingo");
  });
});

describe("addCivilDays — aritmética de calendário", () => {
  it("atravessa fim de mês", () => {
    expect(addCivilDays({ year: 2026, month: 9, day: 30 }, 1)).toEqual({
      year: 2026,
      month: 10,
      day: 1,
    });
  });

  it("atravessa fim de ano, nos dois sentidos", () => {
    expect(addCivilDays({ year: 2026, month: 12, day: 31 }, 1)).toEqual({
      year: 2027,
      month: 1,
      day: 1,
    });
    expect(addCivilDays({ year: 2026, month: 1, day: 1 }, -1)).toEqual({
      year: 2025,
      month: 12,
      day: 31,
    });
  });

  it("conhece ano bissexto", () => {
    expect(addCivilDays({ year: 2028, month: 2, day: 28 }, 1)).toEqual({
      year: 2028,
      month: 2,
      day: 29,
    });
    expect(addCivilDays({ year: 2026, month: 2, day: 28 }, 1)).toEqual({
      year: 2026,
      month: 3,
      day: 1,
    });
  });
});

describe("addMonths", () => {
  it("normaliza a virada de ano nos dois sentidos", () => {
    expect(addMonths({ year: 2026, month: 12 }, 1)).toEqual({
      year: 2027,
      month: 1,
    });
    expect(addMonths({ year: 2026, month: 1 }, -1)).toEqual({
      year: 2025,
      month: 12,
    });
  });
});

describe("monthGrid — seis linhas sempre (D-076)", () => {
  const meses: CivilMonth[] = [
    { year: 2026, month: 2 }, // 28 dias, começa domingo
    { year: 2026, month: 9 },
    { year: 2028, month: 2 }, // bissexto
    { year: 2026, month: 11 },
    { year: 2027, month: 8 },
  ];

  it.each(meses)("$year-$month tem 42 células e começa numa segunda", (mes) => {
    const grade = monthGrid(mes);

    expect(grade).toHaveLength(MONTH_GRID_CELLS);
    expect(weekdayIndex(grade[0]!)).toBe(0);
    expect(weekdayIndex(grade[41]!)).toBe(6);
  });

  it.each(meses)("$year-$month contém todos os seus próprios dias", (mes) => {
    const chaves = new Set(monthGrid(mes).map(civilDayKey));
    const primeiro = { year: mes.year, month: mes.month, day: 1 };

    for (let d = 0; d < 28; d += 1) {
      expect(chaves.has(civilDayKey(addCivilDays(primeiro, d)))).toBe(true);
    }
  });

  it("as células são consecutivas, sem buraco e sem repetição", () => {
    const grade = monthGrid(SETEMBRO);

    expect(new Set(grade.map(civilDayKey)).size).toBe(MONTH_GRID_CELLS);

    for (let i = 1; i < grade.length; i += 1) {
      expect(civilDayKey(grade[i]!)).toBe(
        civilDayKey(addCivilDays(grade[i - 1]!, 1)),
      );
    }
  });

  it("fevereiro de 2026 mostra dias de março, e eles não são do mês", () => {
    const grade = monthGrid({ year: 2026, month: 2 });
    const deMarco = grade.filter(
      (dia) => !isInMonth(dia, { year: 2026, month: 2 }),
    );

    expect(deMarco.length).toBeGreaterThan(0);
  });
});

describe("dayKey — a armadilha do bloco (D-073)", () => {
  it("um date às 23:00 de 30/09 é 30/09, não 01/10", () => {
    /* 2026-09-30 23:00 em São Paulo = 2026-10-01T02:00Z. Agrupado por UTC
       cairia em 1º de outubro, e a maior parte dos dates é à noite. */
    const noite = new Date("2026-10-01T02:00:00Z");

    expect(dayKey(noite)).toBe("2026-09-30");
  });

  it("um date às 23:30 do último dia do mês fica no próprio mês", () => {
    const virada = new Date("2026-10-01T02:30:00Z");

    expect(dayKey(virada)).toBe("2026-09-30");
  });

  it("as datas do seed não cruzam a meia-noite UTC — por isso não bastavam", () => {
    // 20:00 de São Paulo = 23:00Z do mesmo dia. O recorte de ISA acertaria.
    expect(dayKey(new Date("2026-09-26T23:00:00Z"))).toBe("2026-09-26");
  });

  it("meia-noite e um minuto pertence ao dia que começou", () => {
    // 2026-09-15 00:01 em São Paulo = 2026-09-15T03:01Z.
    expect(dayKey(new Date("2026-09-15T03:01:00Z"))).toBe("2026-09-15");
  });
});

describe("monthWindow — janela semiaberta (D-075)", () => {
  it("começa na meia-noite da primeira célula, no fuso do app", () => {
    const grade = monthGrid(SETEMBRO);
    const janela = monthWindow(SETEMBRO);

    expect(janela.start.getTime()).toBe(startOfDayInApp(grade[0]!).getTime());
  });

  it("termina na meia-noite do dia seguinte à última célula", () => {
    const grade = monthGrid(SETEMBRO);
    const janela = monthWindow(SETEMBRO);
    const seguinte = addCivilDays(grade[41]!, 1);

    expect(janela.end.getTime()).toBe(startOfDayInApp(seguinte).getTime());
  });

  it("a borda de cima entra: 23:30 da última célula está dentro", () => {
    const grade = monthGrid(SETEMBRO);
    const janela = monthWindow(SETEMBRO);
    const ultima = grade[41]!;
    const tarde = new Date(
      startOfDayInApp(ultima).getTime() + 23.5 * 60 * 60 * 1000,
    );

    expect(tarde.getTime()).toBeGreaterThanOrEqual(janela.start.getTime());
    expect(tarde.getTime()).toBeLessThan(janela.end.getTime());
  });

  it("a borda de baixo não entra: 23:30 do dia anterior à primeira fica fora", () => {
    const grade = monthGrid(SETEMBRO);
    const janela = monthWindow(SETEMBRO);
    const anterior = addCivilDays(grade[0]!, -1);
    const tarde = new Date(
      startOfDayInApp(anterior).getTime() + 23.5 * 60 * 60 * 1000,
    );

    expect(tarde.getTime()).toBeLessThan(janela.start.getTime());
  });

  it("a meia-noite do fim é exclusiva, e pertence ao mês seguinte", () => {
    const janela = monthWindow(SETEMBRO);
    const proxima = monthWindow(addMonths(SETEMBRO, 1));

    expect(janela.end.getTime()).toBeGreaterThan(janela.start.getTime());
    expect(proxima.start.getTime()).toBeLessThan(janela.end.getTime());
  });
});

describe("buildMonthCells — agrupamento", () => {
  const agora = new Date("2026-09-14T15:00:00Z");

  it("devolve sempre 42 células", () => {
    const celulas = buildMonthCells({
      month: SETEMBRO,
      entries: [],
      now: agora,
    });

    expect(celulas).toHaveLength(MONTH_GRID_CELLS);
    expect(celulas.every((c) => c.entries.length === 0)).toBe(true);
  });

  it("põe o date das 23:00 de 30/09 na célula de 30/09", () => {
    const noturno = entrada({ startsAt: new Date("2026-10-01T02:00:00Z") });
    const celulas = buildMonthCells({
      month: SETEMBRO,
      entries: [noturno],
      now: agora,
    });

    const trinta = celulas.find((c) => c.key === "2026-09-30")!;
    const primeiroDeOutubro = celulas.find((c) => c.key === "2026-10-01")!;

    expect(trinta.entries).toHaveLength(1);
    expect(primeiroDeOutubro.entries).toHaveLength(0);
  });

  it("mostra conteúdo real nas células de fora do mês", () => {
    const grade = monthGrid(SETEMBRO);
    const foraDoMes = grade.find((dia) => !isInMonth(dia, SETEMBRO))!;
    const vizinho = entrada({
      startsAt: new Date(startOfDayInApp(foraDoMes).getTime() + 20 * 3600_000),
    });

    const celulas = buildMonthCells({
      month: SETEMBRO,
      entries: [vizinho],
      now: agora,
    });
    const celula = celulas.find((c) => c.key === civilDayKey(foraDoMes))!;

    expect(celula.inMonth).toBe(false);
    expect(celula.entries).toHaveLength(1);
  });

  it("marca hoje pelo dia civil, não pelo instante", () => {
    const celulas = buildMonthCells({
      month: SETEMBRO,
      entries: [],
      // 2026-09-30 23:00 em São Paulo; em UTC já é outubro.
      now: new Date("2026-10-01T02:00:00Z"),
    });

    expect(celulas.filter((c) => c.isToday)).toHaveLength(1);
    expect(celulas.find((c) => c.isToday)!.key).toBe("2026-09-30");
  });

  it("ordena a confirmada antes da candidata dentro da célula", () => {
    const dia = "2026-09-14";
    const base = startOfDayInApp({ year: 2026, month: 9, day: 14 }).getTime();

    const celulas = buildMonthCells({
      month: SETEMBRO,
      entries: [
        entrada({
          optionId: "cedo-candidata",
          startsAt: new Date(base + 10 * 3600_000),
        }),
        entrada({
          optionId: "tarde-confirmada",
          startsAt: new Date(base + 20 * 3600_000),
          isConfirmed: true,
        }),
      ],
      now: agora,
    });

    const celula = celulas.find((c) => c.key === dia)!;
    expect(celula.entries.map((e) => e.optionId)).toEqual([
      "tarde-confirmada",
      "cedo-candidata",
    ]);
  });

  it("entriesOfDay acha a célula pedida e ignora dia fora da grade", () => {
    const celulas = buildMonthCells({
      month: SETEMBRO,
      entries: [entrada({ startsAt: new Date("2026-09-14T23:00:00Z") })],
      now: agora,
    });

    expect(entriesOfDay(celulas, "2026-09-14")!.entries).toHaveLength(1);
    expect(entriesOfDay(celulas, "2027-01-01")).toBeNull();
    expect(entriesOfDay(celulas, null)).toBeNull();
  });
});

describe("nome acessível da célula (seção 10)", () => {
  const agora = new Date("2026-09-14T15:00:00Z");

  function celulaCom(entries: CalendarEntry[]) {
    return buildMonthCells({ month: SETEMBRO, entries, now: agora }).find(
      (c) => c.key === "2026-09-14",
    )!;
  }

  it("dia vazio é só a data", () => {
    expect(cellAccessibleName(celulaCom([]), "14 de setembro")).toBe(
      "14 de setembro",
    );
  });

  it("dia com um plano candidato não fala em confirmado", () => {
    const celula = celulaCom([
      entrada({ startsAt: new Date("2026-09-14T23:00:00Z") }),
    ]);

    expect(cellAccessibleName(celula, "14 de setembro")).toBe(
      "14 de setembro, 1 plano",
    );
  });

  it("dia com dois planos e um confirmado diz os três números", () => {
    const celula = celulaCom([
      entrada({ optionId: "a", startsAt: new Date("2026-09-14T21:00:00Z") }),
      entrada({
        optionId: "b",
        startsAt: new Date("2026-09-14T23:00:00Z"),
        isConfirmed: true,
      }),
    ]);

    expect(cellAccessibleName(celula, "14 de setembro")).toBe(
      "14 de setembro, 2 planos, 1 confirmado",
    );
  });
});

describe("parâmetros de URL (D-078)", () => {
  it("aceita yyyy-MM", () => {
    expect(parseMonthParam("2026-09")).toEqual({ year: 2026, month: 9 });
    expect(parseMonthParam(" 2026-01 ")).toEqual({ year: 2026, month: 1 });
  });

  it.each([
    "2026-13",
    "2026-00",
    "abc",
    "",
    "2026-9",
    "2026/09",
    "2026-09-14",
    null,
    undefined,
  ])("recusa %s sem lançar", (bruto) => {
    expect(parseMonthParam(bruto)).toBeNull();
  });

  it("ida e volta do parâmetro de mês", () => {
    expect(toMonthParam({ year: 2026, month: 9 })).toBe("2026-09");
    expect(parseMonthParam(toMonthParam(SETEMBRO))).toEqual(SETEMBRO);
  });

  it("aceita yyyy-MM-dd e recusa dia que não existe", () => {
    expect(parseDayParam("2026-09-14")).toEqual({
      year: 2026,
      month: 9,
      day: 14,
    });
    expect(parseDayParam("2026-02-31")).toBeNull();
    expect(parseDayParam("2026-02-29")).toBeNull();
    expect(parseDayParam("2028-02-29")).toEqual({
      year: 2028,
      month: 2,
      day: 29,
    });
  });

  it.each(["", "abc", "2026-09", "14/09/2026", null, undefined])(
    "recusa o dia %s sem lançar",
    (bruto) => {
      expect(parseDayParam(bruto)).toBeNull();
    },
  );

  it("não passa por new Date(): 2026-09 não vira 31 de agosto", () => {
    const mes = parseMonthParam("2026-09")!;
    expect(monthOf(startOfDayInApp({ ...mes, day: 1 }))).toEqual(mes);
  });
});

describe("formatação do mês", () => {
  it("dá o título editorial em português", () => {
    expect(formatMonthTitle(SETEMBRO)).toBe("Setembro de 2026");
    expect(formatMonthTitle({ year: 2027, month: 1 })).toBe("Janeiro de 2027");
  });

  it("monthOf devolve o mês civil do instante, não o de UTC", () => {
    // 2026-09-30 23:00 em São Paulo.
    expect(monthOf(new Date("2026-10-01T02:00:00Z"))).toEqual(SETEMBRO);
  });
});
