import { expect, test, type Page } from "./harness.ts";
import { signInForFeature } from "./feature-session.ts";

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

/**
 * Sessao reaproveitada, nao refeita (secao 8 do docs/PWA_AND_HARDENING.md).
 *
 * Quem precisa de contexto limpo e o spec de entrar e sair; aqui a sessao e
 * meio, nao fim. Medido no B11: com cada spec fazendo o proprio login, a matriz
 * completa acumulava logins novos no Neon Auth e um deles estourava os 30 s da
 * navegacao — falha diferente a cada execucao, com a aplicacao integra.
 */
async function signIn(page: Page): Promise<void> {
  await signInForFeature(page, account);
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
  await page.fill('input[name="placeName"]', "Campos do Jordão");
  await page.click('button:has-text("Salvar alterações")');
  await page.waitForTimeout(2500);
  await page.reload();
  await page.getByText("Editar detalhes", { exact: true }).click();
  await expect(category).toContainText("Viagem");
  await expect(priority).toContainText("Alta");
  await expect(page.locator('input[name="placeName"]')).toHaveValue(
    "Campos do Jordão",
  );

  /* A gaveta é modal: aberta, ela prende o foco e intercepta o clique no que
     está atrás. Fechar antes de seguir é o que a pessoa faz, e é o que o teste
     passa a fazer desde que "Editar detalhes" deixou de ser uma sanfona (R2). */
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

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

test("a ideia nasce incompleta, e o link de referência sobrevive até a tela", async ({
  page,
}) => {
  await signIn(page);

  const titulo = `Referência ${Date.now()}`;
  await criarPlano(page, titulo);

  /* Toda ideia nasce com título e categoria e mais nada (B4). O detalhe abre
     dizendo o que falta, em vez de esconder isso numa gaveta no fim da página. */
  await expect(page.getByText("Complete a ideia", { exact: true })).toBeVisible();
  await expect(page.getByText("0 de 6", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Editar detalhes" }).click();
  await page.fill('input[name="sourceUrl"]', "https://www.instagram.com/p/abc");
  await page.fill('input[name="placeName"]', "Casa do Sol");
  await page.click('button:has-text("Salvar alterações")');

  // Salvar fecha a gaveta: é o sinal de que a Server Action passou.
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 30_000 });

  await page.reload();

  /* O link era gravado no cadastro e depois não existia em lugar nenhum: nem na
     ficha, nem no formulário de edição. Salvar e nunca mais encontrar era o
     mesmo que não salvar (R2). */
  const referencia = page.getByRole("link", { name: /instagram/ }).first();
  await expect(referencia).toBeVisible();
  await expect(referencia).toHaveAttribute(
    "href",
    "https://www.instagram.com/p/abc",
  );
  await expect(page.getByText("2 de 6", { exact: true })).toBeVisible();

  // E volta preenchido no formulário, que é o que torna possível corrigi-lo.
  await page.getByRole("button", { name: "Editar detalhes" }).click();
  await expect(page.locator('input[name="sourceUrl"]')).toHaveValue(
    "https://www.instagram.com/p/abc",
  );
  await page.keyboard.press("Escape");
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

test("no toque, tocar no select de novo fecha o painel", async ({ browser }) => {
  /* O Radix nunca alterna: `handleOpen` so chama `onOpenChange(true)`. No
     toque isso produzia um botao que parece morto — o `pointerdown` fechava
     pelo DismissableLayer e o `click` seguinte reabria, entao o dedo tocava e a
     tela nao mudava. Foi o que o proprietario reportou usando no celular.

     `hasTouch` e o que torna este teste capaz de ver o defeito: com clique de
     mouse o painel fecha, porque a ordem dos eventos e outra. */
  const contexto = await browser.newContext({
    hasTouch: true,
    viewport: { width: 390, height: 844 },
  });
  const page = await contexto.newPage();

  /* Sem `try/finally`: fechar o contexto num `finally` substitui o erro da
     asserção que falhou por "Target page, context or browser has been closed",
     e o relatório passa a esconder exatamente a linha que interessa. O contexto
     morre junto com o browser no teardown. */
  {
    await signInForFeature(page, account);
    await page.goto("/novo");

    /* Seletor CSS, e nao `getByRole`: com o painel aberto o Radix marca o
       resto da pagina como `aria-hidden`, e o motor de acessibilidade do
       Playwright para de enxergar o proprio gatilho. `data-state` e o que o
       Radix escreve no botao, e nao depende da arvore de acessibilidade. */
    const categoria = page.locator('button[role="combobox"]').first();

    /* Toque por coordenada, e nao `locator.tap()`.
 
       Com o painel aberto o Radix poe `pointer-events: none` no body, e a
       checagem de acionabilidade do Playwright recusa o alvo: o teste morreria
       no proprio toque, antes de chegar na asercao, e reprovaria pelo motivo
       errado. O dedo de uma pessoa nao faz essa checagem. */
    const tocarNoGatilho = async () => {
      const caixa = await categoria.boundingBox();
      if (!caixa) throw new Error("o gatilho do select nao esta na tela");
      await page.touchscreen.tap(
        caixa.x + caixa.width / 2,
        caixa.y + caixa.height / 2,
      );
    };

    await expect(categoria).toHaveAttribute("data-state", "closed");

    await tocarNoGatilho();
    await expect(categoria).toHaveAttribute("data-state", "open");

    // O toque de fechar e no proprio gatilho, nao numa opcao.
    await tocarNoGatilho();
    await expect(categoria).toHaveAttribute("data-state", "closed", {
      timeout: 10_000,
    });

    // E continua abrindo depois de fechado: a correcao nao pode travar o select.
    await tocarNoGatilho();
    await expect(categoria).toHaveAttribute("data-state", "open");
  }

  await contexto.close();
});

test("plano de id inexistente responde 404", async ({ page, audit }) => {
  /* O 404 é o objeto do teste, não um acidente: sem declarar a exceção, o
     arnês do B11 reprovaria o próprio comportamento que se quer provar. */
  audit.allow(
    "/planos/ffffffff-ffff-4fff-8fff-ffffffffffff",
    "o teste existe justamente para afirmar que este id responde 404",
  );

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

/**
 * O arquivo tem porta de entrada e porta de saída.
 *
 * Antes desta tela, `archivedAt` escondia o plano de `/ideias`, `/agenda`,
 * `/memorias` e da Home — de tudo. O botão de restaurar existia, mas morava na
 * página de detalhe, que tinha acabado de deixar de ser alcançável: quem não
 * guardasse a URL perdia o plano. Arquivar era apagar com outro nome.
 *
 * O teste segue o caminho inteiro pela interface, sem atalho por URL: arquiva
 * no detalhe, confere que sumiu das Ideias, acha no Perfil, restaura de lá e
 * confere que voltou.
 */
test("arquivar some da lista, aparece no Perfil e volta ao restaurar", async ({
  page,
}) => {
  await signIn(page);

  const titulo = `Teste arquivo ${Date.now()}`;
  await criarPlano(page, titulo);

  await page.getByRole("button", { name: "Arquivar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Tirar do arquivo" }),
  ).toBeVisible({ timeout: 30_000 });

  // Sumiu de onde as ideias vivem.
  await page.goto("/ideias");
  await expect(page.getByText(titulo, { exact: true })).toHaveCount(0);

  // E existe no Perfil, que é a porta de entrada do arquivo.
  await page.goto("/perfil");
  const linha = page.getByRole("listitem").filter({ hasText: titulo });
  await expect(linha).toHaveCount(1);
  await expect(linha).toContainText("Ideia");

  // Restaurar dali devolve o plano à lista, sem passar pelo detalhe.
  await page.getByRole("button", { name: `Restaurar ${titulo}` }).click();
  await expect(page.getByText(titulo, { exact: true })).toHaveCount(0, {
    timeout: 30_000,
  });

  await page.goto("/ideias");
  await expect(page.getByText(titulo, { exact: true }).first()).toBeVisible({
    timeout: 30_000,
  });
});
