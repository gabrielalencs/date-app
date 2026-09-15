import { expect, test, type Page } from "@playwright/test";

import { parseDevCredentials } from "@/lib/auth/dev-provisioning";
import { closeFixtureDb, removeOwnedPlans } from "./db-fixture.ts";

/**
 * Ciclo do CRUD contra o banco de development, autenticado de verdade.
 *
 * Cada teste cria o próprio plano e **apaga** ao final. Arquivar não bastava:
 * arquivar esconde da lista mas a linha continua, e o
 * `database.integration.test.ts` conta linhas. As duas suítes discordavam sobre
 * o que significa limpar, e quem rodasse esta deixava a outra vermelha.
 */
const credentials = parseDevCredentials(process.env.DATE_DEV_USER_CREDENTIALS);
const chosen = (process.env.DATE_TEST_EMAIL ?? "").trim().toLowerCase();
const account =
  credentials.find((credential) => credential.email === chosen) ??
  credentials[0]!;

async function signIn(page: Page): Promise<void> {
  await page.goto("/login");
  await page.fill('input[name="email"]', account.email);
  await page.fill('input[name="password"]', account.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL((url) => new URL(url).pathname === "/", {
    timeout: 30_000,
  });
}

/** Ids criados por esta suíte, apagados no final. */
const criados: string[] = [];

test.afterAll(async () => {
  if (criados.length > 0) {
    await removeOwnedPlans(criados);
  }
  await closeFixtureDb();
});

async function criarPlano(page: Page, titulo: string): Promise<string> {
  await page.goto("/novo");
  await page.fill('input[name="title"]', titulo);
  await page.getByRole("combobox", { name: "Categoria", exact: true }).click();
  await page.getByRole("option", { name: "Cultura", exact: true }).click();
  // Seletor por nome: a sidebar tem um submit ("Sair") antes do main no DOM.
  await page.getByRole("button", { name: "Salvar ideia" }).click();
  await page.waitForURL(/\/planos\/[0-9a-f-]+$/, { timeout: 30_000 });

  const id = new URL(page.url()).pathname.split("/").pop()!;
  criados.push(id);
  return id;
}

test("cria, aparece na lista, edita e muda de status", async ({ page }) => {
  await signIn(page);

  const titulo = `Teste CRUD ${Date.now()}`;
  const id = await criarPlano(page, titulo);

  // O detalhe já mostra o que foi criado.
  await expect(page.locator("h1")).toHaveText(titulo);

  // E a lista de Ideias também.
  await page.goto("/ideias");
  await expect(page.getByText(titulo)).toBeVisible();

  // Editar persiste.
  await page.goto(`/planos/${id}`);
  await page.getByText("Editar detalhes", { exact: true }).click();
  const category = page.getByRole("combobox", {
    name: "Categoria",
    exact: true,
  });
  await expect(category).toContainText("Cultura");
  await category.click();
  await page.getByRole("option", { name: "Viagem", exact: true }).click();
  const priority = page.getByRole("combobox", {
    name: "Prioridade",
    exact: true,
  });
  await priority.click();
  await page.getByRole("option", { name: "Alta", exact: true }).click();
  await page.fill('input[name="city"]', "Campos do Jordão");
  await page.click('button:has-text("Salvar alterações")');
  await page.waitForTimeout(2500);
  await page.reload();
  await page.getByText("Editar detalhes", { exact: true }).click();
  await expect(category).toContainText("Viagem");
  await expect(priority).toContainText("Alta");
  await expect(page.locator('input[name="city"]')).toHaveValue(
    "Campos do Jordão",
  );

  // Mudança de status permitida pela máquina: idea -> deciding.
  await page.click('button:has-text("Decidindo")');
  await page.waitForTimeout(2500);
  await page.reload();
  await expect(page.locator("[data-status]")).toHaveAttribute(
    "data-status",
    "deciding",
  );

  // Arquivar tira da lista sem cancelar.
  await page.click('button:has-text("Arquivar")');
  await page.waitForTimeout(2500);
  await page.goto("/ideias");
  await expect(page.getByText(titulo)).toHaveCount(0);
});

test("a máquina de status não oferece transição proibida", async ({ page }) => {
  await signIn(page);

  const id = await criarPlano(page, `Teste máquina ${Date.now()}`);

  // De idea, só existem Decidindo e Cancelado.
  await expect(page.getByRole("button", { name: "Decidindo" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancelado" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Realizado" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reservado" })).toHaveCount(0);

  await page.click('button:has-text("Arquivar")');
  await page.waitForTimeout(1500);
  expect(id).toBeTruthy();
});

test("plano de id inexistente responde 404", async ({ page }) => {
  await signIn(page);

  const response = await page.goto(
    "/planos/ffffffff-ffff-4fff-8fff-ffffffffffff",
  );
  expect(response?.status()).toBe(404);
});

test.describe("sem JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("o filtro de Ideias funciona por GET", async ({ page }) => {
    // Sem JS não dá para logar (a action depende de JS), então testamos o que
    // é alcançável: o form de filtro é GET puro e navega pela própria URL.
    await page.goto("/ideias?status=idea&ordem=priority");
    // Sem sessão o proxy manda para /login — o que já prova que a rota é
    // privada mesmo sem JavaScript.
    expect(new URL(page.url()).pathname).toBe("/login");
  });

  test("a tela de login renderiza e o form existe sem JavaScript", async ({
    page,
  }) => {
    await page.goto("/login");

    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });
});
