import AxeBuilder from "@axe-core/playwright";

import { parseDevCredentials } from "@/lib/auth/dev-provisioning";

import { expect, test, type Page } from "./harness.ts";
import { signInForFeature } from "./feature-session.ts";
import {
  closeFixtureDb,
  prepareOwnedPlans,
  removeOwnedPlans,
} from "./db-fixture.ts";

/**
 * Varredura do axe (seção 9 do docs/PWA_AND_HARDENING.md).
 *
 * O que ele é: o motor de referência, rodando dentro do Playwright que já
 * existe, sem ir para o pacote do produto.
 *
 * O que ele **não** é: prova de acessibilidade. Ele encontra algo em torno de
 * um terço dos problemas reais — não sabe se o nome acessível faz sentido, se a
 * ordem de leitura é a ordem visual, nem se a tela é usável. Ele acrescenta à
 * seção 2 da Definition of Done; não substitui nada dela.
 */

const credentials = parseDevCredentials(process.env.DATE_DEV_USER_CREDENTIALS);
const account =
  credentials.find(
    (c) => c.email === (process.env.DATE_TEST_EMAIL ?? "").toLowerCase(),
  ) ?? credentials[0]!;

/* Plano proprio, criado e removido por este spec: axe numa pagina vazia nao
   mede nada, e depender do seed faria a varredura depender da ordem. */
const PLANO_A11Y = crypto.randomUUID();

test.beforeAll(async () => {
  await prepareOwnedPlans([PLANO_A11Y]);
});

test.afterAll(async () => {
  await removeOwnedPlans([PLANO_A11Y]);
  await closeFixtureDb();
});

const ROTAS_PRIVADAS = [
  "/",
  "/ideias",
  "/agenda",
  "/memorias",
  "/novo",
  "/perfil",
] as const;

async function varrer(page: Page, url: string) {
  await page.goto(url);
  /* Espera a tela existir antes de medir: axe numa página em branco devolve
     zero violação e não significa nada. */
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const resultado = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  const porSeveridade = resultado.violations.reduce<Record<string, number>>(
    (contagem, violacao) => {
      const chave = violacao.impact ?? "sem-severidade";
      contagem[chave] = (contagem[chave] ?? 0) + 1;
      return contagem;
    },
    {},
  );

  const graves = resultado.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );

  return { resultado, porSeveridade, graves };
}

function relatar(
  url: string,
  tema: string,
  dados: Awaited<ReturnType<typeof varrer>>,
) {
  const contagem = Object.entries(dados.porSeveridade)
    .map(([k, n]) => `${k}=${n}`)
    .join(" ")
    .trim();
  console.log(
    `axe ${tema.padEnd(5)} ${url.padEnd(12)} total=${dados.resultado.violations.length} ${contagem}`,
  );
  /* O nó vai junto: "color-contrast em 7 nós" não diz onde, e uma violação
     sem alvo obriga a caçar de novo o que a ferramenta já sabia. */
  return dados.graves.flatMap((v) =>
    v.nodes.map(
      (n) =>
        `${v.id} (${v.impact}) ${n.target.join(" ")} :: ${n.html.slice(0, 120)} :: ${(n.any[0]?.message ?? "").slice(0, 200)}`,
    ),
  );
}

for (const tema of ["light", "dark"] as const) {
  test.describe(`axe · tema ${tema}`, () => {
    test.use({ colorScheme: tema });

    test(`/login não tem violação serious nem critical`, async ({ page }) => {
      await page.goto("/login");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const resultado = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      const graves = resultado.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      );
      console.log(
        `axe ${tema.padEnd(5)} /login       total=${resultado.violations.length}`,
      );
      expect(graves.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    });

    for (const rota of ROTAS_PRIVADAS) {
      test(`${rota} não tem violação serious nem critical`, async ({
        page,
      }) => {
        await signInForFeature(page, account);
        const dados = await varrer(page, rota);
        expect(relatar(rota, tema, dados)).toEqual([]);
      });
    }

    test(`/planos/[id] não tem violação serious nem critical`, async ({
      page,
    }) => {
      await signInForFeature(page, account);
      const dados = await varrer(page, `/planos/${PLANO_A11Y}`);
      expect(relatar("/planos/[id]", tema, dados)).toEqual([]);
    });
  });
}
