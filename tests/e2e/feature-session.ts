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
    await page.waitForURL((url) => url.pathname === "/", { timeout: 30000 });
    sessions.set(account.email, await page.context().cookies());
  }
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Olá, vocês dois.",
  );
}
