import { describe, expect, it } from "vitest";

import {
  buttonClasses,
  isFilledVariant,
  resolveButtonSize,
} from "@/lib/button-variants";

describe("resolveButtonSize", () => {
  it("força md nos preenchidos, porque rótulo branco sobre coral exige 19px (D-017)", () => {
    expect(resolveButtonSize("accent", "sm")).toBe("md");
    expect(resolveButtonSize("primary", "sm")).toBe("sm");
    expect(resolveButtonSize("danger", "sm")).toBe("sm");
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
    expect(isFilledVariant("accent")).toBe(true);
    expect(isFilledVariant("danger")).toBe(false);
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
    expect(classes).toContain("bg-brand");
    expect(classes).toContain("text-brand-fg");
    expect(classes).not.toMatch(/#[0-9a-f]{3,6}/i);
  });

  it("dá borda ao secondary e nenhum preenchimento ao ghost", () => {
    expect(buttonClasses({ variant: "secondary" })).toContain(
      "border-border-subtle",
    );
    expect(buttonClasses({ variant: "ghost" })).toContain("bg-transparent");
  });

  it("mantém 19px em negrito no coral mesmo pedindo sm", () => {
    const classes = buttonClasses({ variant: "accent", size: "sm" });
    expect(classes).toContain("text-[1.1875rem]");
    /* 700, não 600: branco sobre coral rende 3.09:1 e só passa como texto
       grande, e a WCAG conta como negrito a partir do peso 700 (D-136). */
    expect(classes).toContain("font-bold");
    expect(classes).not.toContain("font-medium");
  });

  it("nunca emite dois pesos de fonte no mesmo botão", () => {
    /* O defeito real: `font-medium` do tamanho e `font-bold` da variante no
       mesmo elemento, com a cascata do Tailwind decidindo a favor do medium. */
    for (const variant of [
      "primary",
      "accent",
      "secondary",
      "outline",
      "ghost",
      "danger",
    ] as const) {
      const classes = buttonClasses({ variant });
      const pesos = classes
        .split(" ")
        .filter((c) => c.startsWith("font-") && c !== "font-feature-settings");
      expect(pesos, variant).toHaveLength(1);
    }
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
