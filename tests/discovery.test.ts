import { describe, expect, it } from "vitest";

import {
  isRandomizableStatus,
  parseDiscoveryFilters,
} from "@/features/discovery/filters";

describe("filtros de descoberta", () => {
  it("interpreta a combinação inteira", () => {
    expect(
      parseDiscoveryFilters({
        status: "planned",
        category: "gastronomia",
        sort: "budget",
        city: "  São Paulo  ",
        maxBudget: "1.234,56",
        favorites: "1",
      }),
    ).toEqual({
      status: "planned",
      category: "gastronomia",
      sort: "budget",
      city: "São Paulo",
      maxBudgetCents: 123456,
      favoritesOnly: true,
    });
  });

  it("URL hostil cai nos padrões sem lançar", () => {
    expect(
      parseDiscoveryFilters({
        status: "wat",
        category: "wat",
        sort: "wat",
        city: "x".repeat(121),
        maxBudget: "abc",
        favorites: "0",
      }),
    ).toEqual({
      status: "open",
      category: undefined,
      sort: "recent",
      city: undefined,
      maxBudgetCents: undefined,
      favoritesOnly: false,
    });
  });

  it("não sorteia realizado nem cancelado", () => {
    expect(isRandomizableStatus("open")).toBe(true);
    expect(isRandomizableStatus("idea")).toBe(true);
    expect(isRandomizableStatus("completed")).toBe(false);
    expect(isRandomizableStatus("cancelled")).toBe(false);
  });
});
