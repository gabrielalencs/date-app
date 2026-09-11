import { expect, test } from "@playwright/test";

import { parseDevCredentials } from "@/lib/auth/dev-provisioning";

/**
 * Teste live: fala com o Neon Auth de `development`. Nunca production.
 *
 * A credencial sai de DATE_DEV_USER_CREDENTIALS, a mesma variável que criou a
 * conta — fonte única, para não existir o modo de falha de a senha do teste
 * divergir da senha real. DATE_TEST_EMAIL só escolhe qual das duas contas usar.
 */
const credentials = parseDevCredentials(process.env.DATE_DEV_USER_CREDENTIALS);
const chosenEmail = (process.env.DATE_TEST_EMAIL ?? "").trim().toLowerCase();
const account =
  credentials.find((credential) => credential.email === chosenEmail) ??
  credentials[0];

if (!account) {
  throw new Error(
    "Nenhuma credencial de development disponível. Defina DATE_DEV_USER_CREDENTIALS no .env.local.",
  );
}

async function signIn(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/login");
  await page.fill('input[name="email"]', account!.email);
  await page.fill('input[name="password"]', account!.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => new URL(url).pathname === "/", {
    timeout: 30_000,
  });
}

test("login válido leva para a Home autenticada", async ({ page }) => {
  await signIn(page);

  expect(new URL(page.url()).pathname).toBe("/");
  // A Home privada renderiza o shell, que /login não tem.
  await expect(
    page
      .locator("nav:visible")
      .getByRole("link", { name: "Início", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Olá, vocês dois.",
  );
});

test("a sessão sobrevive à navegação e o contexto resolve o workspace", async ({
  page,
}) => {
  await signIn(page);

  // /perfil só renderiza porque requireAuthorizedContext devolveu contexto:
  // sessão -> allowlist -> profile -> membership -> workspace -> role.
  await page.goto("/perfil");
  expect(new URL(page.url()).pathname).toBe("/perfil");

  const papel = page.locator("dd").first();
  await expect(papel).toHaveText(/Propriet[áa]rio|Membro/);
});

test("rota privada abre sem redirecionar quando há sessão", async ({
  page,
}) => {
  await signIn(page);

  for (const path of ["/ideias", "/agenda", "/memorias"]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    expect(new URL(page.url()).pathname, path).toBe(path);
  }
});

test("logout invalida a sessão e / volta a exigir login", async ({ page }) => {
  await signIn(page);

  await page.goto("/perfil");
  await page
    .locator("main")
    .getByRole("button", { name: "Sair", exact: true })
    .click();
  await page.waitForURL((url) => new URL(url).pathname === "/login", {
    timeout: 30_000,
  });

  // Não basta ter saído da tela: a sessão tem de estar morta no servidor.
  await page.goto("/");
  await page.waitForURL((url) => new URL(url).pathname === "/login", {
    timeout: 30_000,
  });
  expect(new URL(page.url()).pathname).toBe("/login");
});

test("credencial errada não cria sessão", async ({ page }) => {
  await page.goto("/login");
  await page.fill('input[name="email"]', account!.email);
  await page.fill('input[name="password"]', `${account!.password}-errada`);
  await page.click('button[type="submit"]');

  await expect(page.locator('form [role="alert"]')).toHaveText(
    "E-mail ou senha inválidos.",
    { timeout: 30_000 },
  );
  expect(new URL(page.url()).pathname).toBe("/login");
});
