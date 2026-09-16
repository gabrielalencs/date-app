import { describe, expect, it } from "vitest";

import { groupByCivilMonth } from "@/features/memories/timeline";
import {
  MAX_PAGE,
  memoriesHref,
  pageCount,
  parsePageParam,
} from "@/features/memories/url";
import { startOfDayInApp } from "@/lib/datetime";
import {
  formatAverage,
  isRatingValue,
  isRepeatAnswer,
  pendingLabel,
  ratingOptionLabel,
  summarizeRatings,
  type MemberRating,
} from "@/lib/rating";

/**
 * As regras do B9 que se testam sem banco e sem navegador.
 *
 * O agrupamento por mês roda também em `TZ=UTC` (`pnpm test:tz`): é lá que a
 * virada de mês mente, e é por isso que este arquivo entra na lista do
 * `run-in-timezones.mjs`.
 */

/** Uma pessoa que avaliou. */
function avaliou(
  displayName: string,
  rating: 1 | 2 | 3 | 4 | 5,
): MemberRating {
  return {
    profileId: displayName.toLowerCase(),
    displayName,
    rating,
    wouldRepeat: null,
    highlight: null,
    notes: null,
  };
}

/** Uma pessoa que ainda não avaliou. Ausência não é nota baixa. */
function naoAvaliou(displayName: string): MemberRating {
  return {
    profileId: displayName.toLowerCase(),
    displayName,
    rating: null,
    wouldRepeat: null,
    highlight: null,
    notes: null,
  };
}

describe("a escala e os guardas", () => {
  it("aceita 1 a 5 inteiros e recusa o resto", () => {
    for (const valor of [1, 2, 3, 4, 5]) {
      expect(isRatingValue(valor)).toBe(true);
    }

    for (const valor of [0, 6, -1, 2.5, "3", null, undefined, NaN]) {
      expect(isRatingValue(valor)).toBe(false);
    }
  });

  it("o nome acessível traz a escala junto do valor", () => {
    // "3" sozinho não diz se é bom ou ruim para quem usa leitor de tela.
    expect(ratingOptionLabel(3)).toBe("3 de 5");
    expect(ratingOptionLabel(5)).toBe("5 de 5");
  });

  it("repetiria aceita só os três valores do enum", () => {
    expect(isRepeatAnswer("yes")).toBe(true);
    expect(isRepeatAnswer("maybe")).toBe(true);
    expect(isRepeatAnswer("no")).toBe(true);
    expect(isRepeatAnswer("sim")).toBe(false);
    expect(isRepeatAnswer("")).toBe(false);
    expect(isRepeatAnswer(null)).toBe(false);
  });
});

describe("média — só quando as duas avaliaram (seção 4)", () => {
  it("uma pessoa avaliando não produz média", () => {
    const resumo = summarizeRatings([avaliou("Alex", 4), naoAvaliou("Nina")]);

    expect(resumo.average).toBeNull();
    expect(resumo.answered).toBe(1);
    expect(resumo.waitingOn).toEqual(["Nina"]);
  });

  it("as duas produzem", () => {
    const resumo = summarizeRatings([avaliou("Alex", 5), avaliou("Nina", 4)]);

    expect(resumo.average).toBe(4.5);
    expect(resumo.answered).toBe(2);
    expect(resumo.waitingOn).toEqual([]);
  });

  it("ninguém avaliando não produz média nem zero", () => {
    const resumo = summarizeRatings([naoAvaliou("Alex"), naoAvaliou("Nina")]);

    expect(resumo.average).toBeNull();
    expect(resumo.answered).toBe(0);
  });

  it("a ausência é dita com todas as letras, nunca como nota", () => {
    expect(pendingLabel("Alex")).toBe("Alex ainda não avaliou");
  });

  it("uma nota 1 e uma ausência não se confundem", () => {
    /* O defeito que isto impede: tratar `null` como 0 faria a média de
       "Alex deu 1, Nina não respondeu" virar 0,5 — e um date que uma pessoa
       achou ruim viraria pior do que qualquer um dos dois disse. */
    const comNotaBaixa = summarizeRatings([
      avaliou("Alex", 1),
      avaliou("Nina", 1),
    ]);
    const comAusencia = summarizeRatings([
      avaliou("Alex", 1),
      naoAvaliou("Nina"),
    ]);

    expect(comNotaBaixa.average).toBe(1);
    expect(comAusencia.average).toBeNull();
  });
});

describe("formato da média", () => {
  it("inteiro não ganha casa decimal", () => {
    expect(formatAverage(4)).toBe("4");
    expect(formatAverage(5)).toBe("5");
  });

  it("meio ponto sai com vírgula, não com ponto", () => {
    expect(formatAverage(4.5)).toBe("4,5");
    expect(formatAverage(2.5)).toBe("2,5");
  });

  it("a média de duas notas inteiras nunca precisa de mais de uma casa", () => {
    for (let a = 1; a <= 5; a += 1) {
      for (let b = 1; b <= 5; b += 1) {
        const texto = formatAverage((a + b) / 2);
        expect(texto).toMatch(/^[1-5](,5)?$/);
      }
    }
  });
});

describe("paginação por número na URL (seção 6)", () => {
  it("o que não é inteiro positivo cai na primeira página", () => {
    for (const bruto of [
      "0",
      "-1",
      "abc",
      "",
      "  ",
      "1.5",
      "1e3",
      "0x10",
      "+5",
      null,
      undefined,
    ]) {
      expect(parsePageParam(bruto)).toBe(1);
    }
  });

  it("número válido passa, com espaço em volta", () => {
    expect(parsePageParam("2")).toBe(2);
    expect(parsePageParam(" 7 ")).toBe(7);
  });

  it("um número absurdo é preso ao teto em vez de virar OFFSET gigante", () => {
    expect(parsePageParam("999999999")).toBe(MAX_PAGE);
  });

  it("lista vazia ainda tem uma página: a vazia", () => {
    expect(pageCount(0, 12)).toBe(1);
    expect(pageCount(1, 12)).toBe(1);
    expect(pageCount(12, 12)).toBe(1);
    expect(pageCount(13, 12)).toBe(2);
    expect(pageCount(60, 12)).toBe(5);
  });

  it("a primeira página não carrega parâmetro na URL", () => {
    expect(memoriesHref(1)).toBe("/memorias");
    expect(memoriesHref(0)).toBe("/memorias");
    expect(memoriesHref(3)).toBe("/memorias?pagina=3");
  });
});

describe("agrupamento por mês — dia civil, não UTC (seção 6)", () => {
  type Linha = { titulo: string; quando: Date };

  const instante = (linha: Linha) => linha.quando;

  it("um date às 23:30 do último dia do mês fica naquele mês", () => {
    /* 31 de julho de 2026, 23:30 em São Paulo. Em UTC isso é
       2026-08-01T02:30Z — agrupado por UTC, o date trocaria de mês, e a
       timeline erraria o mês de metade dos dates noturnos (D-073). */
    const viradaDeJulho = new Date("2026-08-01T02:30:00Z");

    const grupos = groupByCivilMonth<Linha>(
      [{ titulo: "Cinema na praça", quando: viradaDeJulho }],
      instante,
    );

    expect(grupos).toHaveLength(1);
    expect(grupos[0]!.month).toEqual({ year: 2026, month: 7 });
    expect(grupos[0]!.title).toBe("Julho de 2026");
  });

  it("a virada do ano também não escorrega", () => {
    // 31/12/2026 23:00 em São Paulo = 2027-01-01T02:00Z.
    const reveillon = new Date("2027-01-01T02:00:00Z");

    const grupos = groupByCivilMonth<Linha>(
      [{ titulo: "Réveillon", quando: reveillon }],
      instante,
    );

    expect(grupos[0]!.month).toEqual({ year: 2026, month: 12 });
  });

  it("agrupa preservando a ordem recebida, do mais recente ao mais antigo", () => {
    const linhas: Linha[] = [
      { titulo: "Setembro", quando: startOfDayInApp({ year: 2026, month: 9, day: 5 }) },
      { titulo: "Agosto A", quando: startOfDayInApp({ year: 2026, month: 8, day: 22 }) },
      { titulo: "Agosto B", quando: startOfDayInApp({ year: 2026, month: 8, day: 3 }) },
      { titulo: "Junho", quando: startOfDayInApp({ year: 2026, month: 6, day: 14 }) },
    ];

    const grupos = groupByCivilMonth(linhas, instante);

    expect(grupos.map((g) => g.title)).toEqual([
      "Setembro de 2026",
      "Agosto de 2026",
      "Junho de 2026",
    ]);
    expect(grupos[1]!.items.map((i) => i.titulo)).toEqual([
      "Agosto A",
      "Agosto B",
    ]);
  });

  it("o mesmo mês em anos diferentes não se funde", () => {
    const linhas: Linha[] = [
      { titulo: "2026", quando: startOfDayInApp({ year: 2026, month: 3, day: 10 }) },
      { titulo: "2025", quando: startOfDayInApp({ year: 2025, month: 3, day: 10 }) },
    ];

    const grupos = groupByCivilMonth(linhas, instante);

    expect(grupos).toHaveLength(2);
    expect(grupos.map((g) => g.title)).toEqual([
      "Março de 2026",
      "Março de 2025",
    ]);
  });

  it("lista vazia devolve nenhum grupo, não um grupo vazio", () => {
    expect(groupByCivilMonth<Linha>([], instante)).toEqual([]);
  });
});
