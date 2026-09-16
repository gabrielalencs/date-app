import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { THEME_COLOR_DARK, THEME_COLOR_LIGHT } from "@/lib/brand";

/**
 * `meta[name=theme-color]` e o manifest não leem variável CSS, então as cores
 * de chrome do sistema são os dois únicos HEX escritos fora do design system
 * (seção 3 do docs/PWA_AND_HARDENING.md).
 *
 * Duplicação de valor sem teste é duplicação que diverge na próxima mudança de
 * paleta — e o sintoma seria uma barra de status da cor antiga, que ninguém
 * repara olhando o navegador do desktop.
 */
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

function bgDeclaradoEm(seletor: string): string {
  const bloco = css.slice(css.indexOf(seletor));
  const encontrado = /--bg:\s*(#[0-9a-fA-F]{3,8});/.exec(bloco);
  expect(encontrado, `--bg não encontrado em ${seletor}`).not.toBeNull();
  return encontrado![1]!.toLowerCase();
}

describe("cores de chrome do sistema", () => {
  it("THEME_COLOR_LIGHT é o --bg do tema claro", () => {
    expect(THEME_COLOR_LIGHT).toBe(bgDeclaradoEm(":root {"));
  });

  it("THEME_COLOR_DARK é o --bg do tema escuro", () => {
    expect(THEME_COLOR_DARK).toBe(bgDeclaradoEm(".dark {"));
  });
});
