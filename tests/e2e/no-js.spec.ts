import { parseDevCredentials } from "@/lib/auth/dev-provisioning";

import { expect, test } from "./harness.ts";
import { signInForFeature } from "./feature-session.ts";

/**
 * As rotas privadas renderizam conteúdo sem JavaScript.
 *
 * **Por que este arquivo existe.** No pacote de performance, a primeira
 * tentativa de fazer o toque responder foi pôr `loading.tsx` nas rotas de
 * lista. Com transmissão e JavaScript desligado, o esqueleto **fica preso na
 * tela para sempre**: a troca pelo conteúdo depende do script que o React
 * injeta. O conteúdo até chega ao DOM, então uma contagem de elementos passava
 * — o que reprovava era só a grade do calendário, e por acidente.
 *
 * O defeito era intermitente, porque o esqueleto só aparece quando a
 * renderização chega a suspender: rota rápida passava, rota lenta quebrava. Foi
 * a pior combinação possível — um contrato quebrado de forma não determinística
 * em duas rotas sem teste que o cobrisse.
 *
 * Este spec cobre. Ele não afirma que a experiência sem JavaScript é boa; ele
 * afirma que ela **existe**, e que nenhuma otimização futura a apaga em
 * silêncio.
 */

const credentials = parseDevCredentials(process.env.DATE_DEV_USER_CREDENTIALS);
const account =
  credentials.find(
    (c) => c.email === (process.env.DATE_TEST_EMAIL ?? "").toLowerCase(),
  ) ?? credentials[0]!;

const ROTAS = [
  ["/", "Olá, vocês dois."],
  ["/ideias", "Ideias para viver"],
  ["/agenda", "Nossa agenda"],
  ["/memorias", "Memórias"],
  ["/perfil", "Perfil"],
] as const;

test.describe("sem JavaScript", () => {
  for (const [rota, titulo] of ROTAS) {
    test(`${rota} renderiza o conteúdo e não deixa esqueleto preso`, async ({
      browser,
    }) => {
      /* A sessão é obtida com JavaScript ligado e transplantada: o login tem
         suíte própria, e o que se mede aqui é a renderização da rota. */
      const comJs = await browser.newContext();
      const paginaComJs = await comJs.newPage();
      await signInForFeature(paginaComJs, account);
      const cookies = await comJs.cookies();
      await comJs.close();

      const semJs = await browser.newContext({ javaScriptEnabled: false });
      await semJs.addCookies(cookies);
      const page = await semJs.newPage();

      await page.goto(rota);

      await expect(page.getByRole("heading", { level: 1 })).toHaveText(titulo);

      /* A prova que faltava: nenhum `aria-busy` sobrando na tela. Um esqueleto
         visível sem JavaScript é um esqueleto para sempre. */
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);

      /* E a navegação continua sendo navegação: links de verdade, que o
         navegador segue sem precisar de script. */
      await expect(
        page.getByRole("navigation", { name: "Navegação principal" }).first(),
      ).toBeVisible();

      await semJs.close();
    });
  }
});
