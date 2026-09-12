import { describe, expect, it } from "vitest";

import {
  centsToInputValue,
  formatCents,
  InvalidMoneyError,
  MAX_CENTS,
  parseBRLToCents,
  sumCents,
} from "@/lib/money";

/** O Intl separa símbolo e valor com espaço não-quebrável. */
const normalize = (value: string) => value.replace(/ /g, " ");

/**
 * A tabela da seção 2 do docs/PLANNING.md, literalmente.
 *
 * As recusas contam como asserção: metade do valor deste parse está no que ele
 * **não** aceita. `1.234,56` virando 1,23 não quebra nada — grava um número
 * plausível cem vezes menor e some.
 */
const ACEITA: readonly [string, number][] = [
  ["80", 8000],
  ["80,50", 8050],
  ["1.234,56", 123456],
  ["1.234", 123400],
  ["1.23", 123],
  ["1234.56", 123456],
  ["R$ 1.234,56", 123456],
  ["0,05", 5],
  ["1.234.567,89", 123456789],
];

const RECUSA: readonly string[] = ["12.3456", "1,234", "-10", "1e3", "", "abc"];

describe("parseBRLToCents — a tabela da seção 2", () => {
  it.each(ACEITA)("%s → %i centavos", (entrada, centavos) => {
    expect(parseBRLToCents(entrada)).toBe(centavos);
  });

  it.each(RECUSA)("recusa %s", (entrada) => {
    expect(() => parseBRLToCents(entrada)).toThrow(InvalidMoneyError);
  });
});

describe("parseBRLToCents — o que a tabela implica", () => {
  it("descarta R$, espaço comum e espaço não separável", () => {
    expect(parseBRLToCents("R$ 80,50")).toBe(8050);
    expect(parseBRLToCents("  R$ 80,50  ")).toBe(8050);
    expect(parseBRLToCents("r$80")).toBe(8000);
  });

  it("aceita uma casa decimal e completa a segunda", () => {
    expect(parseBRLToCents("1,5")).toBe(150);
    expect(parseBRLToCents("0,5")).toBe(50);
  });

  it("aceita valor começando pela vírgula", () => {
    expect(parseBRLToCents(",50")).toBe(50);
  });

  it("aceita zero", () => {
    expect(parseBRLToCents("0")).toBe(0);
    expect(parseBRLToCents("0,00")).toBe(0);
  });

  it("recusa mais de uma vírgula", () => {
    expect(() => parseBRLToCents("1,23,45")).toThrow(InvalidMoneyError);
  });

  it("recusa separador de milhar malformado", () => {
    expect(() => parseBRLToCents("1.2345,67")).toThrow(InvalidMoneyError);
    expect(() => parseBRLToCents("1234.567.89")).toThrow(InvalidMoneyError);
    expect(() => parseBRLToCents(".234")).toThrow(InvalidMoneyError);
  });

  it("recusa ponto ou vírgula sem dígito depois", () => {
    expect(() => parseBRLToCents("1.")).toThrow(InvalidMoneyError);
    expect(() => parseBRLToCents("1,")).toThrow(InvalidMoneyError);
  });

  it("recusa sinal positivo, moeda estrangeira e percentual", () => {
    for (const entrada of ["+10", "$10", "10%", "10 reais"]) {
      expect(() => parseBRLToCents(entrada)).toThrow(InvalidMoneyError);
    }
  });

  it("a mensagem de formato ensina o formato, não diz só que é inválido", () => {
    try {
      parseBRLToCents("abc");
      throw new Error("deveria ter recusado");
    } catch (erro) {
      expect(erro).toBeInstanceOf(InvalidMoneyError);
      expect((erro as Error).message).toContain("1.234,56");
    }
  });
});

describe("teto", () => {
  it("aceita exatamente MAX_CENTS", () => {
    expect(parseBRLToCents("21474836,47")).toBe(MAX_CENTS);
    expect(MAX_CENTS).toBe(2_147_483_647);
  });

  it("recusa um centavo acima, com mensagem própria", () => {
    try {
      parseBRLToCents("21474836,48");
      throw new Error("deveria ter recusado");
    } catch (erro) {
      expect(erro).toBeInstanceOf(InvalidMoneyError);
      // Mensagem de teto, não a de formato.
      expect((erro as Error).message).toContain("valor máximo");
    }
  });
});

describe("formatCents", () => {
  it("formata centavos, não reais", () => {
    expect(normalize(formatCents(8000))).toBe("R$ 80,00");
    expect(normalize(formatCents(8050))).toBe("R$ 80,50");
    expect(normalize(formatCents(5))).toBe("R$ 0,05");
    expect(normalize(formatCents(0))).toBe("R$ 0,00");
  });

  it("agrupa o milhar", () => {
    expect(normalize(formatCents(123456))).toBe("R$ 1.234,56");
    expect(normalize(formatCents(123456789))).toBe("R$ 1.234.567,89");
  });

  it("preserva negativo, que o produto não gera mas também não esconde", () => {
    expect(normalize(formatCents(-4200))).toBe("-R$ 42,00");
  });

  it("recusa o que não é inteiro de centavos", () => {
    expect(() => formatCents(1.5)).toThrow(RangeError);
    expect(() => formatCents(Number.NaN)).toThrow(RangeError);
    expect(() => formatCents(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  /**
   * O formato é montado a partir dos dígitos, sem passar por `cents / 100`.
   * Este teste é o que impede a montagem manual de divergir da convenção do
   * locale — se o Intl mudar de ideia sobre agrupamento ou símbolo, quebra aqui
   * e não na tela.
   */
  it("bate com o formato de moeda do Intl, valor a valor", () => {
    const intl = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

    for (const cents of [
      0,
      1,
      5,
      99,
      100,
      999,
      1000,
      8050,
      123456,
      100000,
      123456789,
      MAX_CENTS,
    ]) {
      expect(normalize(formatCents(cents))).toBe(
        normalize(intl.format(cents / 100)),
      );
    }
  });
});

describe("centsToInputValue", () => {
  it("devolve vazio para nulo", () => {
    expect(centsToInputValue(null)).toBe("");
  });

  it("usa vírgula e não agrupa milhar", () => {
    expect(centsToInputValue(123456)).toBe("1234,56");
    expect(centsToInputValue(5)).toBe("0,05");
    expect(centsToInputValue(0)).toBe("0,00");
  });

  it("faz round-trip com o parse", () => {
    for (const cents of [0, 5, 99, 8050, 123456, 123456789, MAX_CENTS]) {
      expect(parseBRLToCents(centsToInputValue(cents))).toBe(cents);
    }
  });
});

describe("sumCents — soma exata", () => {
  it("três gastos de dez centavos somam exatamente trinta", () => {
    // 0.1 + 0.2 em float é 0.30000000000000004; em centavos, não existe.
    expect(sumCents([10, 10, 10])).toBe(30);
    expect(normalize(formatCents(sumCents([10, 20])))).toBe("R$ 0,30");
  });

  it("lista vazia soma zero", () => {
    expect(sumCents([])).toBe(0);
  });

  it("uma lista longa bate com a conta feita à mão", () => {
    const valores = Array.from({ length: 1000 }, (_, i) => i + 1);
    // 1 + 2 + ... + 1000 = 1000 × 1001 / 2
    expect(sumCents(valores)).toBe((1000 * 1001) / 2);
  });

  it("recusa parcela que não é inteiro de centavos", () => {
    expect(() => sumCents([10, 0.5])).toThrow(RangeError);
  });
});
