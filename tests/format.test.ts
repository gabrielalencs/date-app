import { describe, expect, it } from "vitest";

import { formatBRL } from "@/lib/format";

// O Intl separa símbolo e valor com espaço não-quebrável; normalizar evita teste frágil.
const normalize = (value: string) => value.replace(/ /g, " ");

describe("formatBRL", () => {
  it("formata inteiros com duas casas decimais", () => {
    expect(normalize(formatBRL(120))).toBe("R$ 120,00");
  });

  it("usa ponto como separador de milhar e vírgula como decimal", () => {
    expect(normalize(formatBRL(1234.5))).toBe("R$ 1.234,50");
  });

  it("arredonda para o centavo mais próximo", () => {
    expect(normalize(formatBRL(9.999))).toBe("R$ 10,00");
  });

  it("preserva valores negativos", () => {
    expect(normalize(formatBRL(-42))).toBe("-R$ 42,00");
  });

  it("rejeita valores não finitos", () => {
    expect(() => formatBRL(Number.NaN)).toThrow(RangeError);
    expect(() => formatBRL(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});
