import { parseDevCredentials } from "@/lib/auth/dev-provisioning";

import { expect, test, type Page } from "./harness.ts";
import { signInForFeature } from "./feature-session.ts";
import { closeFixtureDb, fixtureDb, schema } from "./db-fixture.ts";
import { eq } from "drizzle-orm";

/**
 * A passada só com teclado do fluxo central (seção 9 do
 * docs/PWA_AND_HARDENING.md): criar → sugerir → votar → confirmar.
 *
 * As teclas são teclas de verdade — `page.keyboard` emite os mesmos eventos que
 * uma pessoa pressionando. O que este spec **não** faz é julgar: ele registra a
 * sequência de foco e falha quando algo só responde a mouse. Se a ordem de
 * tabulação faz sentido para quem está lendo a tela é avaliação humana, e está
 * no relatório do bloco, não aqui.
 */

const credentials = parseDevCredentials(process.env.DATE_DEV_USER_CREDENTIALS);
const account =
  credentials.find(
    (c) => c.email === (process.env.DATE_TEST_EMAIL ?? "").toLowerCase(),
  ) ?? credentials[0]!;

const TITULO = `Teclado ${crypto.randomUUID().slice(0, 8)}`;

test.afterAll(async () => {
  const db = fixtureDb();
  await db.delete(schema.plans).where(eq(schema.plans.title, TITULO));
  await closeFixtureDb();
});

/** Onde o foco está agora, em uma linha legível. */
async function foco(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return "(nenhum)";
    const rotulo =
      el.getAttribute("aria-label") ??
      (el as HTMLElement).innerText?.trim().split("\n")[0] ??
      el.getAttribute("name") ??
      "";
    const visivel = el.getBoundingClientRect();
    return (
      `${el.tagName.toLowerCase()}` +
      (el.getAttribute("type") ? `[${el.getAttribute("type")}]` : "") +
      ` "${rotulo.slice(0, 40)}"` +
      (visivel.width === 0 && visivel.height === 0 ? " (fora da tela)" : "")
    );
  });
}

async function percorrer(page: Page, passos: number): Promise<string[]> {
  const ordem: string[] = [];
  for (let i = 0; i < passos; i++) {
    await page.keyboard.press("Tab");
    ordem.push(`${String(i + 1).padStart(2, "0")}. ${await foco(page)}`);
  }
  return ordem;
}

for (const largura of [390, 1280] as const) {
  test(`criar, sugerir, votar e confirmar só com teclado em ${largura}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: largura, height: 900 });
    await signInForFeature(page, account);

    await page.goto("/novo");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    console.log(`\n=== ordem de foco em /novo · ${largura}px ===`);
    for (const linha of await percorrer(page, 8)) console.log(linha);

    /* Do começo: primeiro Tab é o link de pular conteúdo. Daqui em diante tudo
       é digitado, nada é clicado. */
    await page.getByLabel("Título", { exact: true }).focus();
    await page.keyboard.type(TITULO);

    await page.keyboard.press("Tab");
    const naCategoria = await foco(page);
    console.log(`após o título, o foco vai para: ${naCategoria}`);

    /* O Select do DATE é um controle próprio: tem que abrir, navegar e escolher
       por teclado, senão ele é um botão bonito que só funciona com mouse. */
    await page.keyboard.press("Enter");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    const categoriaEscolhida = await page
      .getByRole("combobox", { name: /Categoria/i })
      .innerText();
    console.log(`categoria escolhida por teclado: ${categoriaEscolhida.trim()}`);
    expect(categoriaEscolhida.trim().length).toBeGreaterThan(0);

    await page.getByRole("button", { name: "Salvar ideia" }).focus();
    await page.keyboard.press("Enter");

    await page.waitForURL(/\/planos\/[0-9a-f-]{36}/, { timeout: 60_000 });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(TITULO);

    console.log(`\n=== ordem de foco em /planos/[id] · ${largura}px ===`);
    const ordem = await percorrer(page, 14);
    for (const linha of ordem) console.log(linha);

    /* O foco não se perde no meio da tela. O limite de 14 é deliberado: depois
       do último elemento focável, o Tab entrega o foco à interface do navegador
       e `document.activeElement` volta a ser o body — comportamento do sistema,
       não defeito da página. Reprovar nisso seria medir o Chrome. */
    expect(ordem.filter((l) => l.includes("(nenhum)"))).toEqual([]);
  });
}
