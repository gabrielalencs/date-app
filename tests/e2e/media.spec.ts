import { eq } from "drizzle-orm";
import { expect, test, type Page } from "./harness.ts";

import { buildObjectKeys } from "@/features/media/r2/object-key";
import { parseDevCredentials } from "@/lib/auth/dev-provisioning";
import {
  prepareOwnedPlans,
  removeOwnedPlans,
  closeFixtureDb,
  fixtureDb,
  limparMidiaDosPlanos,
  schema,
} from "./db-fixture.ts";
import { EXIF_MARCADOR, pngComExif } from "./exif-fixture.ts";
import { signInForFeature } from "./feature-session.ts";

/**
 * Verificação em navegador de verdade: a foto passa pelo pipeline do cliente,
 * sobe pelo PUT assinado e volta pela rota autenticada.
 *
 * É aqui que se prova o que nenhum teste em Node consegue: que o
 * `createImageBitmap` decodifica, que o reencode acontece, e que o EXIF do
 * arquivo de entrada não sobrevive à ida e volta (D-051).
 */
const credentials = parseDevCredentials(process.env.DATE_DEV_USER_CREDENTIALS);
const account =
  credentials.find(
    (c) => c.email === (process.env.DATE_TEST_EMAIL ?? "").toLowerCase(),
  ) ?? credentials[0]!;

/* Um plano temporário por teste. Compartilhar um só faria cada teste herdar as
   fotos do anterior, e a contagem passaria a medir a ordem de execução. */
const PLANO_EXIF = crypto.randomUUID();
const PLANO_CABECALHO = crypto.randomUUID();
/* A fixture nasce aberta: /ideias filtra por status aberto por padrão. */
const PLANO_CAPA = crypto.randomUUID();
const PLANO_MEDIDAS = crypto.randomUUID();
const PLANOS_USADOS = [
  PLANO_EXIF,
  PLANO_CABECALHO,
  PLANO_CAPA,
  PLANO_MEDIDAS,
] as const;

/* Workspace de fora, montado direto no banco: a rota precisa responder "não
   encontrado" para a mídia dele, e para isso ela precisa existir. */
const WORKSPACE_FORA = crypto.randomUUID();
const PROFILE_FORA = "e2e_profile_" + crypto.randomUUID();
const PLANO_FORA = crypto.randomUUID();
let midiaDeFora = "";

/**
 * Sessão reaproveitada, não refeita (seção 8 do docs/PWA_AND_HARDENING.md).
 *
 * Este spec fazia seis logins novos contra o Neon Auth, e o provedor passa a
 * demorar quando eles se acumulam: na suíte consolidada do B11, o login de um
 * dos testes de mídia estourava os 30 s enquanto o resto passava. Quem precisa
 * de contexto limpo é o spec de entrar e sair; aqui a sessão é meio, não fim.
 */
async function signIn(page: Page): Promise<void> {
  await signInForFeature(page, account);
}

/** Envia a foto pelo input escondido e devolve o id que a rota passa a servir. */
async function enviarFoto(page: Page, bytes: Buffer): Promise<string> {
  const antes = await page.locator('img[src^="/api/media/"]').count();

  await page.locator('input[type="file"]').setInputFiles({
    name: "foto-com-exif.png",
    mimeType: "image/png",
    buffer: bytes,
  });

  const imagens = page.locator('img[src^="/api/media/"]');
  await expect(imagens).toHaveCount(antes + 1, { timeout: 60_000 });

  const src = await imagens.first().getAttribute("src");
  const id = /\/api\/media\/([0-9a-f-]{36})/.exec(src ?? "")?.[1];

  if (!id) {
    throw new Error(`Não achei o id da mídia em "${src}".`);
  }

  return id;
}

test.beforeAll(async () => {
  const db = fixtureDb();
  await prepareOwnedPlans(PLANOS_USADOS);

  await db
    .insert(schema.workspaces)
    .values({ id: WORKSPACE_FORA, name: "Workspace de fora (e2e)" })
    .onConflictDoNothing();
  await db
    .insert(schema.profiles)
    .values({ id: PROFILE_FORA, displayName: "Pessoa de fora" })
    .onConflictDoNothing();
  await db
    .insert(schema.workspaceMembers)
    .values({
      workspaceId: WORKSPACE_FORA,
      profileId: PROFILE_FORA,
      role: "owner",
    })
    .onConflictDoNothing();
  await db
    .insert(schema.plans)
    .values({
      id: PLANO_FORA,
      workspaceId: WORKSPACE_FORA,
      title: "Plano de fora",
      category: "outro",
      createdBy: PROFILE_FORA,
    })
    .onConflictDoNothing();

  const keys = buildObjectKeys({
    workspaceId: WORKSPACE_FORA,
    planId: PLANO_FORA,
    mediaUuid: crypto.randomUUID(),
  });

  const [linha] = await db
    .insert(schema.media)
    .values({
      workspaceId: WORKSPACE_FORA,
      planId: PLANO_FORA,
      objectKey: keys.full,
      thumbObjectKey: keys.thumb,
      mimeType: "image/webp",
      sizeBytes: 10,
      purpose: "cover",
      uploadedBy: PROFILE_FORA,
    })
    .returning({ id: schema.media.id });

  midiaDeFora = linha!.id;
});

test.afterAll(async () => {
  const db = fixtureDb();

  // Linhas e objetos: apagar só as linhas encheria o bucket de órfão.
  await removeOwnedPlans(PLANOS_USADOS);

  // Cascata leva plano, mídia e membership do workspace de fora.
  await db
    .delete(schema.workspaces)
    .where(eq(schema.workspaces.id, WORKSPACE_FORA));
  await db.delete(schema.profiles).where(eq(schema.profiles.id, PROFILE_FORA));

  await closeFixtureDb();
});

test("o EXIF da imagem enviada não sobrevive ao reencode", async ({ page }) => {
  const comExif = await pngComExif("public/brand/icons/icon-512.png");
  expect(comExif.includes(EXIF_MARCADOR)).toBe(true);

  await signIn(page);
  await page.goto(`/planos/${PLANO_EXIF}`);

  const mediaId = await enviarFoto(page, comExif);

  for (const variante of ["", "?v=thumb"]) {
    const resposta = await page.request.get(`/api/media/${mediaId}${variante}`);
    expect(resposta.status()).toBe(200);

    const corpo = await resposta.body();

    // Saiu WebP, e não o PNG que entrou.
    expect(corpo.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(corpo.subarray(8, 12).toString("ascii")).toBe("WEBP");

    // E o metadado do arquivo original não está em lugar nenhum.
    expect(corpo.includes(EXIF_MARCADOR)).toBe(false);
    expect(corpo.includes(Buffer.from("eXIf", "ascii"))).toBe(false);
    expect(corpo.includes(Buffer.from("Exif", "ascii"))).toBe(false);
  }
});

test("a rota serve a imagem com o cabeçalho de cache privado", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/planos/${PLANO_CABECALHO}`);

  const comExif = await pngComExif("public/brand/icons/icon-512.png");
  const mediaId = await enviarFoto(page, comExif);

  const resposta = await page.request.get(`/api/media/${mediaId}`);

  expect(resposta.status()).toBe(200);
  expect(resposta.headers()["content-type"]).toBe("image/webp");
  expect(resposta.headers()["cache-control"]).toBe(
    "private, max-age=604800, immutable",
  );
  expect(resposta.headers()["x-content-type-options"]).toBe("nosniff");
});

test("a rota responde não encontrado para mídia de outro workspace", async ({
  page,
}) => {
  await signIn(page);

  const deFora = await page.request.get(`/api/media/${midiaDeFora}`);
  expect(deFora.status()).toBe(404);

  const inexistente = await page.request.get(
    `/api/media/${crypto.randomUUID()}`,
  );
  expect(inexistente.status()).toBe(404);

  // Mesma resposta para os dois: nada confirma que o id de fora existe.
  expect(await deFora.text()).toBe(await inexistente.text());
});

test("sem sessão, a rota não devolve bytes de imagem", async ({ browser }) => {
  const anonimo = await browser.newContext();

  try {
    const resposta = await anonimo.request.get(`/api/media/${midiaDeFora}`, {
      maxRedirects: 0,
    });

    expect(resposta.status()).not.toBe(200);
    expect(resposta.headers()["content-type"] ?? "").not.toContain("image/");
  } finally {
    await anonimo.close();
  }
});

test("a foto vira a capa e substitui a capa tipográfica no card", async ({
  page,
}) => {
  await signIn(page);
  await limparMidiaDosPlanos([PLANO_CAPA]);
  await page.goto(`/planos/${PLANO_CAPA}`);

  const comExif = await pngComExif("public/brand/icons/icon-512.png");
  const mediaId = await enviarFoto(page, comExif);

  // A primeira foto entra como capa.
  await expect(page.getByText("Capa", { exact: true })).toBeVisible();

  await page.goto("/ideias");
  const noCard = page.locator(`img[src*="/api/media/${mediaId}"]`);
  await expect(noCard).toBeVisible();

  // Remove e a capa tipográfica volta.
  await page.goto(`/planos/${PLANO_CAPA}`);
  await page.getByRole("button", { name: "Remover foto" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Remover esta foto?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Manter foto" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Remover foto" }).first().click();
  await dialog
    .getByRole("button", { name: "Remover foto", exact: true })
    .click();
  await expect(page.locator('img[src^="/api/media/"]')).toHaveCount(0, {
    timeout: 30_000,
  });

  await page.goto("/ideias");
  await expect(page.locator(`img[src*="/api/media/${mediaId}"]`)).toHaveCount(
    0,
  );
});

/**
 * Itens 10 e 11 da auto-verificação, medidos no navegador em vez de inspecionados:
 * alvo de toque, texto mínimo, scroll horizontal e foco visível.
 */
const LARGURAS = [320, 390, 1280] as const;

for (const largura of LARGURAS) {
  test(`medidas da interface de fotos em ${largura}px`, async ({ page }) => {
    await page.setViewportSize({ width: largura, height: 900 });
    await signIn(page);
    await limparMidiaDosPlanos([PLANO_MEDIDAS]);
    await page.goto(`/planos/${PLANO_MEDIDAS}`);

    await enviarFoto(page, await pngComExif("public/brand/icons/icon-512.png"));
    await enviarFoto(page, await pngComExif("public/brand/icons/icon-512.png"));

    const medidas = await page.evaluate(() => {
      const pequenos: string[] = [];
      const miudos: string[] = [];

      for (const el of document.querySelectorAll<HTMLElement>(
        "button, a, input, select, textarea, [role='button']",
      )) {
        /* O que se mede é o alvo efetivo, não a caixa do elemento:
           - input escondido (o de arquivo) não é alvo: quem recebe o toque é
             o botão que o dispara;
           - checkbox e radio crescem por padding invisível do label que os
             envolve, que é onde o toque cai (design system, seção 6). */
        const escondido =
          el.getBoundingClientRect().width <= 1 &&
          el.getBoundingClientRect().height <= 1;
        if (escondido) continue;

        const tipo = (el as HTMLInputElement).type;
        const alvo =
          tipo === "checkbox" || tipo === "radio"
            ? (el.closest("label") ?? el)
            : el;

        const r = alvo.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;

        if (r.width < 44 || r.height < 44) {
          pequenos.push(
            `${el.tagName.toLowerCase()}[${el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 24) ?? ""}] alvo ${Math.round(r.width)}x${Math.round(r.height)}`,
          );
        }
      }

      for (const el of document.querySelectorAll<HTMLElement>("*")) {
        if (!el.textContent?.trim() || el.children.length > 0) continue;
        const tamanho = Number.parseFloat(getComputedStyle(el).fontSize);
        if (tamanho > 0 && tamanho < 12) {
          miudos.push(`${el.tagName.toLowerCase()} ${tamanho}px`);
        }
      }

      const raiz = document.documentElement;
      return {
        pequenos,
        miudos,
        scrollHorizontal: raiz.scrollWidth > raiz.clientWidth,
        scrollWidth: raiz.scrollWidth,
        clientWidth: raiz.clientWidth,
      };
    });

    expect(medidas.pequenos, "alvos de toque abaixo de 44px").toEqual([]);
    expect(medidas.miudos, "texto abaixo de 12px").toEqual([]);
    expect(
      medidas.scrollHorizontal,
      `scroll horizontal: ${medidas.scrollWidth} > ${medidas.clientWidth}`,
    ).toBe(false);

    /* Foco medido por TECLADO e não por .focus() programático: em Chromium um
       botão só casa com :focus-visible depois de interação de teclado, então
       focar por script mediria a ausência do anel em vez da presença dele. */
    await page.keyboard.press("Tab");

    const anel = await page.evaluate(() => {
      const alvo = document.activeElement as HTMLElement | null;
      if (!alvo || alvo === document.body) return null;
      const s = getComputedStyle(alvo);
      return {
        elemento: alvo.tagName.toLowerCase(),
        outlineStyle: s.outlineStyle,
        outlineWidth: s.outlineWidth,
        boxShadow: s.boxShadow,
      };
    });

    expect(anel, "nada recebeu foco ao pressionar Tab").not.toBeNull();
    expect(
      anel!.outlineStyle !== "none" || anel!.boxShadow !== "none",
      `foco sem indicação visível: ${JSON.stringify(anel)}`,
    ).toBe(true);

    await limparMidiaDosPlanos([PLANO_MEDIDAS]);
  });
}
