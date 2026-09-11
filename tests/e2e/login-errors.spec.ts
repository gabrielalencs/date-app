import { expect, test } from "@playwright/test";

/**
 * A Server Action nunca pode devolver 500 nem texto do provedor para quem só
 * tentou entrar. Roda sem conta criada: com ou sem auth configurado, a
 * resposta visível é a mesma mensagem genérica.
 */
const GENERIC = "E-mail ou senha inválidos.";

test("credencial inválida mostra apenas a mensagem genérica", async ({
  page,
}) => {
  await page.goto("/login");

  await page.fill('input[name="email"]', "ninguem@example.invalid");
  await page.fill('input[name="password"]', "senha-que-nao-existe");
  await page.click('button[type="submit"]');

  const alert = page.locator('form [role="alert"]');
  await expect(alert).toHaveText(GENERIC, { timeout: 20_000 });

  // Continua em /login e não vazou nada do provedor nem stack trace.
  expect(new URL(page.url()).pathname).toBe("/login");
  const html = (await page.content()).toLowerCase();
  expect(html).not.toContain("allowed_emails");
  expect(html).not.toContain("neon_auth_cookie_secret");
  expect(html).not.toContain("stack");
});

test("payload vazio não derruba a página", async ({ page }) => {
  await page.goto("/login");

  // noValidate no form: o submit chega ao servidor mesmo vazio.
  await page.click('button[type="submit"]');

  await expect(page.locator('form [role="alert"]')).toHaveText(GENERIC, {
    timeout: 20_000,
  });
});
