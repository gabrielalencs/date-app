import { describe, expect, it } from "vitest";

import {
  CATEGORIES,
  CATEGORY_OPTIONS,
  categoryLabel,
  FALLBACK_CATEGORY,
  isCategory,
  toCategory,
} from "@/lib/categories";

describe("lista canônica", () => {
  it("tem as oito categorias da seção 7", () => {
    expect(CATEGORIES).toHaveLength(8);
    expect(CATEGORY_OPTIONS.map(({ label }) => label)).toEqual([
      "Gastronomia",
      "Cinema e teatro",
      "Música",
      "Viagem",
      "Ar livre",
      "Cultura",
      "Em casa",
      "Outro",
    ]);
  });
});

describe("valor desconhecido não quebra a tela (D-040)", () => {
  it.each([
    ["categoria_que_nao_existe"],
    [""],
    ["GASTRONOMIA"],
    [null],
    [undefined],
    [42],
    [{}],
  ])("%o vira a categoria de fallback", (value) => {
    expect(toCategory(value)).toBe(FALLBACK_CATEGORY);
    expect(categoryLabel(value)).toBe("Outro");
  });

  it("isCategory só aceita os valores exatos", () => {
    expect(isCategory("gastronomia")).toBe(true);
    expect(isCategory("Gastronomia")).toBe(false);
    expect(isCategory("outro")).toBe(true);
    expect(isCategory(null)).toBe(false);
  });
});

describe("rótulos", () => {
  it("toda categoria tem rótulo não vazio", () => {
    for (const category of CATEGORIES) {
      expect(categoryLabel(category).length).toBeGreaterThan(0);
    }
  });

  it("o valor guardado é o slug, não o rótulo", () => {
    // A coluna é text; guardar o rótulo quebraria ao renomear a exibição.
    expect(CATEGORIES).toContain("cinema_teatro");
    expect(CATEGORIES).not.toContain("Cinema e teatro");
  });
});
