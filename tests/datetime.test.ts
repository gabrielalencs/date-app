import { describe, expect, it } from "vitest";

import {
  APP_TIMEZONE,
  InvalidDateInputError,
  civilDateOf,
  civilDayCount,
  civilDaysBetween,
  formatCompactDay,
  formatDaySpan,
  formatDateTime,
  formatDay,
  formatRelativeDay,
  formatRelativeHours,
  formatShortDate,
  formatTime,
  formatWeekday,
  fromCivil,
  isFutureCivilDay,
  isSameCivilDay,
  parseDateInput,
  startOfDayInApp,
  toCivil,
  toDateInputValue,
  toTimeInputValue,
} from "@/lib/datetime";

/**
 * Este arquivo roda em três fusos, por `pnpm test:tz` (D-060): `TZ=UTC`,
 * `TZ=America/New_York` e o fuso local da máquina.
 *
 * Toda asserção aqui tem que dar o mesmo resultado nos três. Um teste de data
 * que só roda no fuso de quem escreveu não testa nada — e o par que produz o
 * defeito real deste projeto é exatamente São Paulo (onde se escreve) contra
 * UTC (onde roda a Vercel).
 *
 * O instante escolhido como sentinela é de propósito: 2026-06-14T02:00:00Z é
 * 13 de junho às 23h em São Paulo. Em UTC já é dia 14. Se alguma função
 * responder "14", ela está lendo o fuso errado.
 */
const SENTINELA = new Date("2026-06-14T02:00:00Z");

/** É este arquivo que o ESLint deixa usar os leitores locais, para comparar. */
const fusoDoProcesso =
  process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

describe("a sentinela distingue o fuso do app do fuso do processo", () => {
  it("é 13 de junho em São Paulo, mesmo quando o processo está em UTC", () => {
    expect(civilDateOf(SENTINELA)).toEqual({ year: 2026, month: 6, day: 13 });
  });

  it("o resultado não depende do fuso em que o teste roda", () => {
    // Só documenta em qual fuso esta execução está; a asserção acima é a prova.
    expect(typeof fusoDoProcesso).toBe("string");
    expect(APP_TIMEZONE).toBe("America/Sao_Paulo");
  });
});

describe("toCivil e fromCivil", () => {
  it("lê os campos de calendário no fuso do app", () => {
    expect(toCivil(SENTINELA)).toEqual({
      year: 2026,
      month: 6,
      day: 13,
      hour: 23,
      minute: 0,
    });
  });

  it("fromCivil é o inverso de toCivil", () => {
    const civil = { year: 2026, month: 6, day: 13, hour: 23, minute: 0 };
    expect(fromCivil(civil).toISOString()).toBe(SENTINELA.toISOString());
  });

  it("a ida e volta preserva o instante, em várias épocas do ano", () => {
    for (const iso of [
      "2026-01-15T14:30:00Z",
      "2026-06-14T02:00:00Z",
      "2026-10-18T03:00:00Z",
      "2026-12-31T23:59:00Z",
      "2019-02-16T02:30:00Z",
    ]) {
      const instante = new Date(iso);
      const voltou = fromCivil(toCivil(instante));
      expect(voltou.getTime()).toBe(
        instante.getTime() - (instante.getTime() % 60_000),
      );
    }
  });

  it("meia-noite não vira 24h", () => {
    const meiaNoite = startOfDayInApp({ year: 2026, month: 6, day: 14 });
    expect(toCivil(meiaNoite).hour).toBe(0);
    expect(toCivil(meiaNoite).day).toBe(14);
  });
});

describe("dia inteiro", () => {
  it("meia-noite de São Paulo é 03:00Z, e volta como o mesmo dia", () => {
    const dia = startOfDayInApp({ year: 2026, month: 6, day: 14 });

    expect(dia.toISOString()).toBe("2026-06-14T03:00:00.000Z");
    expect(civilDateOf(dia)).toEqual({ year: 2026, month: 6, day: 14 });
  });

  it("o dia guardado sobrevive à ida e volta em todo o ano", () => {
    for (let mes = 1; mes <= 12; mes += 1) {
      const civil = { year: 2026, month: mes, day: 15 };
      expect(civilDateOf(startOfDayInApp(civil))).toEqual(civil);
    }
  });
});

describe("comparação de dia civil", () => {
  it("23h de sábado e 1h de domingo são dias diferentes", () => {
    const sabado = new Date("2026-06-14T02:00:00Z"); // 13/06 23h em SP
    const domingo = new Date("2026-06-14T04:00:00Z"); // 14/06 01h em SP

    expect(isSameCivilDay(sabado, domingo)).toBe(false);
    expect(civilDaysBetween(sabado, domingo)).toBe(1);
  });

  it("duas horas de distância podem ser um dia, e 23 horas podem ser zero", () => {
    // 2h de diferença, cruzando a meia-noite civil.
    expect(
      civilDaysBetween(
        new Date("2026-06-14T02:00:00Z"),
        new Date("2026-06-14T04:00:00Z"),
      ),
    ).toBe(1);

    // 23h de diferença, dentro do mesmo dia civil.
    expect(
      civilDaysBetween(
        new Date("2026-06-14T03:30:00Z"),
        new Date("2026-06-15T02:30:00Z"),
      ),
    ).toBe(0);
  });

  it("conta dias civis através da virada de mês e de ano", () => {
    expect(
      civilDaysBetween(
        startOfDayInApp({ year: 2026, month: 12, day: 30 }),
        startOfDayInApp({ year: 2027, month: 1, day: 2 }),
      ),
    ).toBe(3);
  });

  it("isFutureCivilDay ignora hora e olha só o dia", () => {
    const hoje23h = new Date("2026-06-14T02:00:00Z"); // 13/06 23h SP
    const hoje01h = new Date("2026-06-13T04:00:00Z"); // 13/06 01h SP
    const amanha = new Date("2026-06-15T03:00:00Z"); // 15/06 00h SP

    expect(isFutureCivilDay(hoje23h, hoje01h)).toBe(false);
    expect(isFutureCivilDay(amanha, hoje23h)).toBe(true);
    expect(isFutureCivilDay(hoje01h, hoje23h)).toBe(false);
  });
});

describe("formatação", () => {
  it("dia da semana em português, capitalizado", () => {
    expect(formatWeekday(SENTINELA)).toBe("Sábado");
  });

  it("dia e mês, sem o ano quando é o ano de referência", () => {
    const agora = startOfDayInApp({ year: 2026, month: 1, day: 1 });
    expect(formatDay(SENTINELA, agora)).toBe("13 de junho");
  });

  it("com o ano quando é outro ano", () => {
    const agora = startOfDayInApp({ year: 2025, month: 1, day: 1 });
    expect(formatDay(SENTINELA, agora)).toBe("13 de junho de 2026");
  });

  it("hora em 24h, no fuso do app", () => {
    expect(formatTime(SENTINELA)).toBe("23:00");
    expect(formatTime(new Date("2026-06-14T12:05:00Z"))).toBe("09:05");
  });

  it("data curta", () => {
    expect(formatShortDate(SENTINELA)).toBe("13/06");
  });

  it("data e hora completas, e sem hora quando é dia inteiro", () => {
    const agora = startOfDayInApp({ year: 2026, month: 1, day: 1 });

    expect(formatDateTime(SENTINELA, { now: agora })).toBe(
      "Sábado, 13 de junho, 23:00",
    );
    expect(formatDateTime(SENTINELA, { allDay: true, now: agora })).toBe(
      "Sábado, 13 de junho",
    );
  });

  it("meia-noite formata como 00:00 e não como 24:00", () => {
    expect(formatTime(startOfDayInApp({ year: 2026, month: 6, day: 14 }))).toBe(
      "00:00",
    );
  });
});

describe("rolê de vários dias (R2)", () => {
  const sexta = startOfDayInApp({ year: 2026, month: 10, day: 9 });
  const domingo = startOfDayInApp({ year: 2026, month: 10, day: 11 });

  it("conta as duas pontas: de sexta a domingo são três dias", () => {
    expect(civilDayCount(sexta, domingo)).toBe(3);
  });

  it("um dia só é um dia", () => {
    expect(civilDayCount(sexta, sexta)).toBe(1);
  });

  it("conta dias civis, não períodos de 24 horas", () => {
    /* Sai sábado às 23h e volta domingo à 1h: são dois dias de calendário e
       duas horas de relógio. Subtrair milissegundos daria um dia. */
    const noite = fromCivil({ year: 2026, month: 10, day: 10, hour: 23, minute: 0 });
    const madrugada = fromCivil({
      year: 2026,
      month: 10,
      day: 11,
      hour: 1,
      minute: 0,
    });

    expect(civilDayCount(noite, madrugada)).toBe(2);
  });

  it("atravessa a virada do mês", () => {
    const fim = startOfDayInApp({ year: 2026, month: 11, day: 2 });
    const comeco = startOfDayInApp({ year: 2026, month: 10, day: 30 });

    expect(civilDayCount(comeco, fim)).toBe(4);
  });

  it("escreve o intervalo curto, no fuso do app", () => {
    expect(formatCompactDay(sexta)).toBe("Sex, 9 de out.");
    expect(formatDaySpan(sexta, domingo)).toBe("Sex, 9 de out. – Dom, 11 de out.");
  });
});

describe("formatRelativeDay", () => {
  const hoje = new Date("2026-06-14T02:00:00Z"); // 13/06 23h em SP

  it("hoje, mesmo faltando uma hora para virar o dia", () => {
    expect(formatRelativeDay(new Date("2026-06-13T14:00:00Z"), hoje)).toBe(
      "hoje",
    );
  });

  it("amanhã, mesmo faltando só duas horas", () => {
    expect(formatRelativeDay(new Date("2026-06-14T04:00:00Z"), hoje)).toBe(
      "amanhã",
    );
  });

  it("ontem, em dias e no passado", () => {
    expect(formatRelativeDay(new Date("2026-06-13T01:00:00Z"), hoje)).toBe(
      "ontem",
    );
    expect(formatRelativeDay(new Date("2026-06-08T15:00:00Z"), hoje)).toBe(
      "há 5 dias",
    );
  });

  it("em N dias", () => {
    expect(formatRelativeDay(new Date("2026-06-20T15:00:00Z"), hoje)).toBe(
      "em 7 dias",
    );
  });
});

describe("formatRelativeHours", () => {
  const agora = new Date("2026-06-14T12:30:00Z");

  it("distingue menos de uma hora, singular e plural", () => {
    expect(
      formatRelativeHours(new Date("2026-06-14T12:00:01Z"), agora),
    ).toBe("há menos de 1 hora");
    expect(
      formatRelativeHours(new Date("2026-06-14T11:15:00Z"), agora),
    ).toBe("há 1 hora");
    expect(
      formatRelativeHours(new Date("2026-06-14T09:30:00Z"), agora),
    ).toBe("há 3 horas");
  });

  it("não anuncia futuro quando os relógios diferem", () => {
    expect(
      formatRelativeHours(new Date("2026-06-14T12:31:00Z"), agora),
    ).toBe("há menos de 1 hora");
  });
});

describe("valores de formulário", () => {
  it("toDateInputValue devolve o dia de São Paulo, não o de UTC", () => {
    // 21h de SP já é o dia seguinte em UTC: o atalho do toISOString erraria.
    const noite = new Date("2026-06-14T02:00:00Z");
    expect(toDateInputValue(noite)).toBe("2026-06-13");
    expect(noite.toISOString().slice(0, 10)).toBe("2026-06-14");
  });

  it("toTimeInputValue devolve a hora de São Paulo", () => {
    expect(toTimeInputValue(SENTINELA)).toBe("23:00");
  });
});

describe("parseDateInput", () => {
  it("sem horário devolve a meia-noite do dia em São Paulo", () => {
    expect(parseDateInput("2026-06-14").toISOString()).toBe(
      "2026-06-14T03:00:00.000Z",
    );
  });

  it("com horário devolve o instante correspondente", () => {
    expect(parseDateInput("2026-06-14", "20:30").toISOString()).toBe(
      "2026-06-14T23:30:00.000Z",
    );
  });

  it("a ida e volta pelo formulário preserva o dia", () => {
    for (const dia of ["2026-01-01", "2026-06-14", "2026-12-31"]) {
      expect(toDateInputValue(parseDateInput(dia))).toBe(dia);
    }
  });

  it("recusa dia que não existe em vez de deslizar para o mês seguinte", () => {
    expect(() => parseDateInput("2026-02-31")).toThrow(InvalidDateInputError);
    expect(() => parseDateInput("2026-04-31")).toThrow(InvalidDateInputError);
  });

  it("aceita 29 de fevereiro em ano bissexto", () => {
    expect(toDateInputValue(parseDateInput("2028-02-29"))).toBe("2028-02-29");
  });

  it("recusa formato inválido, com mensagem escrita para gente", () => {
    for (const ruim of ["14/06/2026", "2026-6-14", "", "ontem"]) {
      expect(() => parseDateInput(ruim)).toThrow(/dia válido/);
    }
  });

  it("recusa horário inválido", () => {
    for (const ruim of ["25:00", "12:60", "8:30", "20h"]) {
      expect(() => parseDateInput("2026-06-14", ruim)).toThrow(
        /horário válido/,
      );
    }
  });

  it("horário vazio ou nulo é tratado como dia inteiro", () => {
    const esperado = "2026-06-14T03:00:00.000Z";
    expect(parseDateInput("2026-06-14", "").toISOString()).toBe(esperado);
    expect(parseDateInput("2026-06-14", null).toISOString()).toBe(esperado);
    expect(parseDateInput("2026-06-14", "   ").toISOString()).toBe(esperado);
  });
});

describe("nenhum offset fixo", () => {
  it("a conversão vem da base de fusos, não de um -3 escrito à mão", () => {
    /* Se alguém trocar a base de fusos por aritmética de -3, este teste
       continua passando — por isso ele não é a prova. A prova é a varredura
       por `-3` e `10800000` no código, no relatório do bloco. Aqui só se
       registra o valor atual, para a mudança ficar visível se a lei mudar. */
    const inverno = startOfDayInApp({ year: 2026, month: 7, day: 15 });
    const verao = startOfDayInApp({ year: 2026, month: 1, day: 15 });

    expect(inverno.toISOString()).toBe("2026-07-15T03:00:00.000Z");
    expect(verao.toISOString()).toBe("2026-01-15T03:00:00.000Z");
  });

  it("antes de 2019 o Brasil tinha horário de verão, e a base sabe disso", () => {
    // 16/02/2019 ainda estava em UTC−2; a base de fusos resolve sozinha.
    const comHorarioDeVerao = startOfDayInApp({
      year: 2019,
      month: 2,
      day: 15,
    });

    expect(comHorarioDeVerao.toISOString()).toBe("2019-02-15T02:00:00.000Z");
  });
});
