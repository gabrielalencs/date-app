import { expect, type Cookie, type Page } from "@playwright/test";

// Sessão real, somente em memória. Auth tem suíte própria; os testes de uma
// feature não precisam criar uma sessão no provedor para cada viewport.
const sessions = new Map<string, Cookie[]>();

export async function signInForFeature(
  page: Page,
  account: { email: string; password: string },
): Promise<void> {
  const cookies = sessions.get(account.email);
  if (cookies) {
    await page.context().addCookies(cookies);
    await page.goto("/");
  } else {
    await page.goto("/login");
    await page.getByLabel("E-mail", { exact: true }).fill(account.email);
    await page.getByLabel("Senha", { exact: true }).fill(account.password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    /* 60 s, não 30. A espera é por navegação, não por tempo: o que ela aguarda é
   o Neon Auth responder ao login novo. Medido no B11: em 5 execuções seguidas
   da suíte consolidada, uma falhou exatamente aqui aos 30 s, com a aplicação
   íntegra. A latência é do provedor, e um teste que reprova por latência de
   terceiro ensina a rodar de novo em vez de ler. */
    await page.waitForURL((url) => url.pathname === "/", { timeout: 60_000 });
    sessions.set(account.email, await page.context().cookies());
  }
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Olá, vocês dois.",
  );
}
