import { describe, expect, it } from "vitest";

import {
  countFilled,
  isComplete,
  linkLabel,
  planGaps,
  type PlanFacts,
} from "@/features/plans/completeness";

/**
 * A regra do bloco "Complete a ideia" (R2).
 *
 * Módulo puro de propósito: o que ele decide é produto — o que conta como
 * preenchido —, e isso precisa ser verificável sem banco, sem sessão e sem
 * renderizar nada.
 */

const VAZIO: PlanFacts = {
  description: null,
  placeName: null,
  city: null,
  estimatedBudgetCents: null,
  sourceUrl: null,
  notes: null,
  coverMediaId: null,
};

describe("planGaps", () => {
  it("uma ideia recém-salva não tem nada preenchido", () => {
    const gaps = planGaps(VAZIO);
    expect(gaps).toHaveLength(6);
    expect(gaps.map((gap) => gap.label)).toEqual([
      "Foto de capa",
      "Onde",
      "Orçamento",
      "Descrição",
      "Referência",
      "Observações",
    ]);
    expect(countFilled(gaps)).toBe(0);
    expect(isComplete(gaps)).toBe(false);
  });

  it("espaço em branco não conta como resposta", () => {
    const gaps = planGaps({
      ...VAZIO,
      description: "   ",
      placeName: "\n",
      sourceUrl: " ",
      notes: "\t",
    });
    expect(countFilled(gaps)).toBe(0);
  });

  it("a cidade cobre o campo Onde quando não há nome de lugar", () => {
    const so = (facts: PlanFacts) =>
      planGaps(facts).find((gap) => gap.key === "place");

    expect(so({ ...VAZIO, city: "Fortaleza" })).toMatchObject({
      filled: true,
      detail: "Fortaleza",
    });
    expect(
      so({ ...VAZIO, placeName: "Cantina do Porto", city: "Fortaleza" }),
    ).toMatchObject({ filled: true, detail: "Cantina do Porto" });
    expect(so(VAZIO)).toMatchObject({ filled: false });
  });

  it("orçamento zero é uma resposta, não uma ausência", () => {
    /* Um rolê de graça é um rolê decidido. Tratar 0 como vazio faria a tela
       pedir para sempre um número que já foi dado. */
    const gap = planGaps({ ...VAZIO, estimatedBudgetCents: 0 }).find(
      (candidate) => candidate.key === "budget",
    );
    expect(gap?.filled).toBe(true);
  });

  it("a ficha completa é as seis respostas", () => {
    const gaps = planGaps({
      description: "Jantar tranquilo",
      placeName: "Cantina do Porto",
      city: "Fortaleza",
      estimatedBudgetCents: 18_000,
      sourceUrl: "https://www.instagram.com/p/abc",
      notes: "Reservar perto da janela",
      coverMediaId: "11111111-1111-4111-8111-111111111111",
    });
    expect(isComplete(gaps)).toBe(true);
    expect(gaps.find((gap) => gap.key === "sourceUrl")?.detail).toBe(
      "instagram.com",
    );
  });
});

describe("linkLabel", () => {
  it("mostra o domínio sem www", () => {
    expect(linkLabel("https://www.google.com/maps/place/x")).toBe("google.com");
    expect(linkLabel("https://maps.app.goo.gl/abc")).toBe("maps.app.goo.gl");
  });

  it("não derruba a página por causa de um link inválido", () => {
    /* A URL passa pelo Zod na escrita, mas a leitura não confia nisso: uma
       linha antiga ou colada à mão não passou por lá. */
    expect(linkLabel("isso não é uma url")).toBe("Abrir referência");
    expect(linkLabel("")).toBe("Abrir referência");
  });
});
