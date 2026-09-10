import { describe, expect, it } from "vitest";

import {
  buttonClasses,
  isFilledVariant,
  resolveButtonSize,
} from "@/lib/button-variants";

describe("resolveButtonSize", () => {
  it("força md nos preenchidos, porque rótulo branco sobre coral exige 19px (D-017)", () => {
    expect(resolveButtonSize("primary", "sm")).toBe("md");
    expect(resolveButtonSize("danger", "sm")).toBe("md");
  });

  it("permite sm nos não preenchidos", () => {
    expect(resolveButtonSize("secondary", "sm")).toBe("sm");
    expect(resolveButtonSize("ghost", "sm")).toBe("sm");
  });

  it("usa md como padrão", () => {
    expect(resolveButtonSize("secondary")).toBe("md");
  });
});

describe("isFilledVariant", () => {
  it("separa preenchimento sólido de borda e ghost", () => {
    expect(isFilledVariant("primary")).toBe(true);
    expect(isFilledVariant("danger")).toBe(true);
    expect(isFilledVariant("secondary")).toBe(false);
    expect(isFilledVariant("ghost")).toBe(false);
  });
});

describe("buttonClasses", () => {
  it("garante alvo de toque de 44px em toda variante", () => {
    for (const variant of [
      "primary",
      "secondary",
      "ghost",
      "danger",
    ] as const) {
      expect(buttonClasses({ variant })).toContain("min-h-11");
    }
  });

  it("pinta o primary com o token de acento, não com hex", () => {
    const classes = buttonClasses({ variant: "primary" });
    expect(classes).toContain("bg-accent");
    expect(classes).toContain("text-accent-fg");
    expect(classes).not.toMatch(/#[0-9a-f]{3,6}/i);
  });

  it("dá borda ao secondary e nenhum preenchimento ao ghost", () => {
    expect(buttonClasses({ variant: "secondary" })).toContain(
      "border-border-strong",
    );
    expect(buttonClasses({ variant: "ghost" })).toContain("bg-transparent");
  });

  it("mantém o tamanho de 19px semibold no coral mesmo pedindo sm", () => {
    const classes = buttonClasses({ variant: "primary", size: "sm" });
    expect(classes).toContain("text-[1.1875rem]");
    expect(classes).toContain("font-semibold");
  });

  it("aplica largura total e estado de carregando quando pedido", () => {
    const classes = buttonClasses({
      variant: "primary",
      fullWidth: true,
      loading: true,
    });
    expect(classes).toContain("w-full");
    expect(classes).toContain("pointer-events-none");
  });
});
