import { describe, expect, it } from "vitest";

import {
  isThemePreference,
  parseStoredPreference,
  resolveTheme,
} from "@/lib/theme";

describe("resolveTheme", () => {
  it("respeita a escolha explícita, ignorando o sistema", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("segue o sistema quando a preferência é system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});

describe("parseStoredPreference", () => {
  it("aceita os três valores válidos", () => {
    expect(parseStoredPreference("light")).toBe("light");
    expect(parseStoredPreference("dark")).toBe("dark");
    expect(parseStoredPreference("system")).toBe("system");
  });

  it("cai em system quando o storage está vazio ou corrompido", () => {
    expect(parseStoredPreference(null)).toBe("system");
    expect(parseStoredPreference("")).toBe("system");
    expect(parseStoredPreference("Dark")).toBe("system");
    expect(parseStoredPreference("sepia")).toBe("system");
  });
});

describe("isThemePreference", () => {
  it("rejeita valores que não são preferência de tema", () => {
    expect(isThemePreference("system")).toBe(true);
    expect(isThemePreference("auto")).toBe(false);
    expect(isThemePreference(null)).toBe(false);
    expect(isThemePreference(2)).toBe(false);
  });
});
