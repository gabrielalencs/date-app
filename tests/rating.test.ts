import { describe, expect, it } from "vitest";

import { REPEAT_LABELS } from "@/features/memories/constants";
import {
  averageRatingTenths,
  formatTenths,
  isRatingValue,
  isRepeatAnswer,
  MAX_RATING,
  RATING_VALUES,
  ratingOptionLabel,
  ratingsGiven,
  REPEAT_ANSWERS,
  waitingOnRating,
  type MemberRating,
} from "@/lib/rating";

/**
 * As regras de duas pessoas avaliando, testadas sem banco — irmãs das do
 * consenso do B6, e pelo mesmo motivo.
 */
function pessoa(
  displayName: string,
  rating: MemberRating["rating"],
  wouldRepeat: MemberRating["wouldRepeat"] = null,
): MemberRating {
  return { profileId: displayName.toLowerCase(), displayName, rating, wouldRepeat };
}

describe("média — não existe com um avaliador só", () => {
  it("uma pessoa avaliando não produz média", () => {
    expect(
      averageRatingTenths([pessoa("Alex", 4), pessoa("Nina", null)]),
    ).toBeNull();
  });

  it("as duas avaliando produzem média", () => {
    expect(averageRatingTenths([pessoa("Alex", 4), pessoa("Nina", 5)])).toBe(45);
    expect(formatTenths(45)).toBe("4,5");
  });

  it("nota máxima dos dois dá 5,0 e não 5", () => {
    const media = averageRatingTenths([pessoa("Alex", 5), pessoa("Nina", 5)]);
    expect(media).toBe(50);
    expect(formatTenths(media!)).toBe("5,0");
  });

  it("a menor média possível é 1,0", () => {
    const media = averageRatingTenths([pessoa("Alex", 1), pessoa("Nina", 1)]);
    expect(formatTenths(media!)).toBe("1,0");
  });

  it("ninguém avaliando também não produz média", () => {
    expect(
      averageRatingTenths([pessoa("Alex", null), pessoa("Nina", null)]),
    ).toBeNull();
  });

  it("workspace sem membro nenhum não produz média", () => {
    expect(averageRatingTenths([])).toBeNull();
  });

  it("todos os pares de notas dão média com uma casa exata", () => {
    for (const a of RATING_VALUES) {
      for (const b of RATING_VALUES) {
        const media = averageRatingTenths([pessoa("A", a), pessoa("B", b)]);
        expect(media).toBe((a + b) * 5);
        // Com duas pessoas a média é sempre x,0 ou x,5 — nunca arredondada.
        expect(formatTenths(media!)).toMatch(/^[1-5],[05]$/);
      }
    }
  });
});

describe("ausência é ausência, não zero", () => {
  it("quem não avaliou entra como null e é contado como faltante", () => {
    const avaliacoes = [pessoa("Alex", 4), pessoa("Nina", null)];

    expect(ratingsGiven(avaliacoes)).toBe(1);
    expect(waitingOnRating(avaliacoes)).toEqual(["Nina"]);
  });

  it("zero não é uma nota possível", () => {
    expect(isRatingValue(0)).toBe(false);
    expect(isRatingValue(6)).toBe(false);
    expect(isRatingValue(3)).toBe(true);
    expect(isRatingValue("3")).toBe(false);
    expect(isRatingValue(null)).toBe(false);
  });

  it("com as duas avaliando não falta ninguém", () => {
    expect(waitingOnRating([pessoa("Alex", 4), pessoa("Nina", 2)])).toEqual([]);
  });
});

describe("formatTenths monta a partir dos dígitos, sem float", () => {
  it("uma casa decimal, sempre", () => {
    expect(formatTenths(0)).toBe("0,0");
    expect(formatTenths(5)).toBe("0,5");
    expect(formatTenths(10)).toBe("1,0");
    expect(formatTenths(37)).toBe("3,7");
    expect(formatTenths(50)).toBe("5,0");
  });

  it("recusa o que não é décimo inteiro", () => {
    expect(() => formatTenths(4.5)).toThrow(RangeError);
    expect(() => formatTenths(-10)).toThrow(RangeError);
  });
});

describe("nome acessível de cada posição", () => {
  it("diz a escala, não só o número", () => {
    expect(ratingOptionLabel(3)).toBe("3 de 5");
    expect(ratingOptionLabel(1)).toBe("1 de 5");
    expect(ratingOptionLabel(MAX_RATING)).toBe("5 de 5");
  });

  it("as cinco posições têm nome próprio e distinto", () => {
    const nomes = new Set(RATING_VALUES.map(ratingOptionLabel));
    expect(nomes.size).toBe(5);
  });
});

describe("repetiria?", () => {
  it("são três respostas, e nenhuma é ícone ou emoji", () => {
    expect(REPEAT_ANSWERS).toEqual(["yes", "maybe", "no"]);

    for (const resposta of REPEAT_ANSWERS) {
      const rotulo = REPEAT_LABELS[resposta];
      expect(rotulo.length).toBeGreaterThan(0);
      // Sem emoji: a seção 9 do design system proíbe emoji como ícone.
      expect(/\p{Extended_Pictographic}/u.test(rotulo)).toBe(false);
    }
  });

  it("reconhece só os três valores do enum do banco", () => {
    expect(isRepeatAnswer("yes")).toBe(true);
    expect(isRepeatAnswer("talvez")).toBe(false);
    expect(isRepeatAnswer(null)).toBe(false);
  });
});
