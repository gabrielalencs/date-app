import { readFileSync } from "node:fs";

import AxeBuilder from "@axe-core/playwright";
import { eq, inArray } from "drizzle-orm";
import { expect, test, type Page } from "./harness.ts";

import { buildObjectKeys } from "@/features/media/r2/object-key";
import { parseDevCredentials } from "@/lib/auth/dev-provisioning";
import {
  prepareOwnedPlans,
  removeOwnedPlans,
  closeFixtureDb,
  fixtureDb,
  limparMidiaDosPlanos,
  removerObjetos,
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
const PLANO_HEIC = crypto.randomUUID();
/* Vídeo (D-184): dois planos realizados — a Galeria só existe depois do rolê —
   e um aberto, para a capa recusar vídeo. */
const PLANO_VIDEO = crypto.randomUUID();
const PLANO_VIDEO_MEDIDAS = crypto.randomUUID();
const PLANO_VIDEO_CAPA = crypto.randomUUID();
const PLANO_VIDEO_REENVIO = crypto.randomUUID();
const PLANO_VIDEO_CONFIRMA = crypto.randomUUID();
const PLANOS_USADOS = [
  PLANO_EXIF,
  PLANO_CABECALHO,
  PLANO_CAPA,
  PLANO_MEDIDAS,
  PLANO_HEIC,
  PLANO_VIDEO,
  PLANO_VIDEO_MEDIDAS,
  PLANO_VIDEO_CAPA,
  PLANO_VIDEO_REENVIO,
  PLANO_VIDEO_CONFIRMA,
] as const;

/* O mesmo marcador que `fixtures/gerar-video.mjs` grava no átomo `©xyz`. */
const MARCADOR_GPS = "+19.4326-099.1332/";
const ATOMO_GPS = Buffer.from([0xa9, 0x78, 0x79, 0x7a]); // "©xyz"

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

/**
 * Envia a foto pelo input escondido e devolve o id que a rota passa a servir.
 *
 * A contagem é da **grade**, não da página inteira. A capa passou a aparecer
 * nos dois lugares — herói no topo e ladrilho marcado "Capa" na grade —, então
 * `img[src^="/api/media/"]` no documento inteiro cresce de dois em dois para a
 * primeira foto e o `antes + 1` deixou de valer. A grade é o que este helper
 * está de fato observando.
 */
/**
 * Envia a capa pela gaveta "Editar detalhes", que e onde ela passou a morar.
 *
 * Ate o R2 a capa entrava pela grade de fotos do plano; no R3 a grade virou a
 * **galeria**, que so existe depois do role, e a capa ganhou controle proprio
 * dentro da gaveta — sem miniatura, so o estado e as acoes. Por isso o sinal de
 * sucesso aqui e o texto da gaveta mudar, e a prova visual e a capa aparecer no
 * topo da pagina depois de fechar.
 */
async function enviarCapa(page: Page, bytes: Buffer): Promise<string> {
  await page.getByRole("button", { name: "Editar detalhes" }).click();
  const gaveta = page.getByRole("dialog", { name: "Editar detalhes" });
  await expect(gaveta).toBeVisible();

  await gaveta.locator('input[type="file"]').setInputFiles({
    name: "foto-com-exif.png",
    mimeType: "image/png",
    buffer: bytes,
  });

  await expect(gaveta.getByText(/ja tem capa|j\u00e1 tem capa/)).toBeVisible({
    timeout: 60_000,
  });

  await page.keyboard.press("Escape");
  await expect(gaveta).toHaveCount(0);

  const capa = page.locator('img[src^="/api/media/"]').first();
  await expect(capa).toBeVisible({ timeout: 30_000 });

  const src = await capa.getAttribute("src");
  const id = /\/api\/media\/([0-9a-f-]{36})/.exec(src ?? "")?.[1];

  if (!id) {
    throw new Error(`Nao achei o id da capa em "${src}".`);
  }

  return id;
}

/** Envia pela grade da galeria, que so existe em plano ja realizado. */
async function enviarFoto(page: Page, bytes: Buffer): Promise<string> {
  const grade = page.locator('ul li img[src^="/api/media/"]');
  const antes = await grade.count();

  await page.locator('input[type="file"]').setInputFiles({
    name: "foto-com-exif.png",
    mimeType: "image/png",
    buffer: bytes,
  });

  await expect(grade).toHaveCount(antes + 1, { timeout: 60_000 });

  const src = await grade.last().getAttribute("src");
  const id = /\/api\/media\/([0-9a-f-]{36})/.exec(src ?? "")?.[1];

  if (!id) {
    throw new Error(`Não achei o id da mídia em "${src}".`);
  }

  return id;
}

test.beforeAll(async () => {
  const db = fixtureDb();
  await prepareOwnedPlans(PLANOS_USADOS);

  /* A galeria so existe depois do role (R3), e e ela que os testes de medida
     precisam ver com duas fotos dentro. O status vai direto no banco de
     proposito: quem esta sob teste aqui e a interface de fotos, nao a maquina
     de status, que tem suite propria e pre-condicoes que exigiriam montar data
     confirmada so para chegar em `completed`. */
  await db
    .update(schema.plans)
    .set({ status: "completed" })
    .where(
      inArray(schema.plans.id, [
        PLANO_MEDIDAS,
        PLANO_HEIC,
        PLANO_VIDEO,
        PLANO_VIDEO_MEDIDAS,
        PLANO_VIDEO_REENVIO,
        PLANO_VIDEO_CONFIRMA,
      ]),
    );

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

  const mediaId = await enviarCapa(page, comExif);

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
  const mediaId = await enviarCapa(page, comExif);

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
  const mediaId = await enviarCapa(page, comExif);

  await page.goto("/ideias");
  const noCard = page.locator(`img[src*="/api/media/${mediaId}"]`);
  await expect(noCard).toBeVisible();

  // Remove pela gaveta, que e onde a capa passou a ser gerenciada (R3).
  await page.goto(`/planos/${PLANO_CAPA}`);
  await page.getByRole("button", { name: "Editar detalhes" }).click();
  const gaveta = page.getByRole("dialog", { name: "Editar detalhes" });
  await gaveta.getByRole("button", { name: "Remover capa" }).click();

  const confirmar = page.getByRole("dialog", { name: "Remover a capa?" });
  await expect(confirmar).toBeVisible();

  // Desistir mantem a capa.
  await confirmar.getByRole("button", { name: "Manter capa" }).click();
  await expect(confirmar).toHaveCount(0);
  await expect(page.locator('img[src^="/api/media/"]')).toHaveCount(1);

  await gaveta.getByRole("button", { name: "Remover capa" }).click();
  await confirmar
    .getByRole("button", { name: "Remover capa", exact: true })
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
 * A foto HEIC do Samsung, de ponta a ponta (D-183).
 *
 * O Chromium, como o Chrome do Android, não abre HEIC: a foto passa pelos três
 * decodificadores do navegador, cai na libheif, é reencodada em WebP e sobe. O
 * arnês reprova violação de CSP, então o teste também prova que o worker da
 * biblioteca roda sob a política do projeto.
 *
 * A fixture é o `examples/example.heic` do próprio projeto libheif: 1280×854,
 * com uma miniatura de 320×212 embutida. A dimensão gravada é o que prova que
 * foi a imagem principal que subiu, e não a miniatura.
 */
test("uma foto HEIC é convertida no aparelho e sobe como qualquer outra", async ({
  page,
}) => {
  const heic = readFileSync("tests/e2e/fixtures/exemplo.heic");

  await signIn(page);
  await limparMidiaDosPlanos([PLANO_HEIC]);
  await page.goto(`/planos/${PLANO_HEIC}`);

  const grade = page.locator('ul li img[src^="/api/media/"]');

  for (const [indice, arquivo] of [
    /* Como a câmera do Samsung entrega. */
    { name: "20261007_121314.heic", mimeType: "image/heic" },
    /* Como chega de outro app ou de pasta não indexada: sem tipo útil e sem
       extensão. Só o conteúdo diz que é HEIC. */
    { name: "foto", mimeType: "application/octet-stream" },
  ].entries()) {
    await page
      .locator('input[type="file"]')
      .setInputFiles({ ...arquivo, buffer: heic });
    await expect(grade).toHaveCount(indice + 1, { timeout: 90_000 });
  }

  const midias = await fixtureDb()
    .select({
      width: schema.media.width,
      height: schema.media.height,
      mimeType: schema.media.mimeType,
    })
    .from(schema.media)
    .where(eq(schema.media.planId, PLANO_HEIC));

  expect(midias).toEqual([
    { width: 1280, height: 854, mimeType: "image/webp" },
    { width: 1280, height: 854, mimeType: "image/webp" },
  ]);
});

/**
 * O vídeo de ponta a ponta (D-184), no caminho real: a Mediabunny no Chromium,
 * H.264 e AAC do navegador, PUT assinado no `date-media-dev`, linha no banco,
 * e leitura em pedaços pela rota autenticada.
 *
 * A fixture imita o vídeo de um Android: 65 s, quadros deitados com rotação
 * de 90° no contêiner (vídeo gravado em pé), e a coordenada de GPS num átomo
 * `©xyz`. Ver `fixtures/gerar-video.mjs`.
 */
test("um vídeo longo é cortado, convertido no aparelho e toca pela rota autenticada", async ({
  page,
}) => {
  const bruto = readFileSync("tests/e2e/fixtures/video-65s.mp4");
  expect(bruto.includes(Buffer.from(MARCADOR_GPS))).toBe(true);

  await signIn(page);
  await limparMidiaDosPlanos([PLANO_VIDEO]);
  await page.goto(`/planos/${PLANO_VIDEO}`);

  await page.locator('input[type="file"]').setInputFiles({
    name: "VID_20261011_201512.mp4",
    mimeType: "video/mp4",
    buffer: bruto,
  });

  const gaveta = page.getByRole("dialog", { name: "Escolha o trecho" });
  await expect(gaveta).toBeVisible();

  // Vídeo longo abre com o trecho no teto: do começo até 1:00.
  await expect(gaveta.getByText("Trecho de 1:00")).toBeVisible({
    timeout: 30_000,
  });
  await expect(gaveta.getByText(/O vídeo tem 1:05\./)).toBeVisible();

  /* As alças contam em décimos de segundo: "600" é 1:00. */
  const inicio = gaveta.getByRole("slider", { name: "Início do trecho" });
  const fim = gaveta.getByRole("slider", { name: "Fim do trecho" });
  await expect(inicio).toHaveValue("0");
  await expect(fim).toHaveValue("600");

  /* No teto, o início desliza o trecho inteiro. E tocar a prévia e logo
     arrastar uma alça — que interrompe o `play()` com `pause()` — não é
     prévia quebrada. */
  await gaveta.getByRole("button", { name: "Tocar o trecho" }).click();
  await inicio.fill("30");
  await expect(fim).toHaveValue("630");
  await expect(gaveta.getByText("Trecho de 1:00")).toBeVisible();
  await expect(gaveta.getByText(/A prévia não abriu/)).toHaveCount(0);
  await expect(
    gaveta.getByRole("button", { name: "Tocar o trecho" }),
  ).toBeEnabled();

  // O fim encurta.
  await fim.fill("110");
  await expect(inicio).toHaveValue("30");
  await expect(gaveta.getByText("Trecho de 0:08")).toBeVisible();

  await gaveta.getByRole("button", { name: "Enviar trecho" }).click();
  await expect(gaveta).toHaveCount(0, { timeout: 120_000 });

  const ladrilho = page.getByRole("button", {
    name: /^Assistir ao vídeo de .+, 8 segundos$/,
  });
  await expect(ladrilho).toBeVisible({ timeout: 30_000 });

  /* Foco por teclado chega no ladrilho, e o anel aparece por dentro: o
     quadrado em volta corta o que passa da borda. Tab a partir do botão de
     adicionar, porque `.focus()` por script não acende `:focus-visible`. */
  /* `locator("button")`, e não `getByRole`: o input de arquivo escondido tem
     o mesmo nome, e o Chromium o expõe com papel de botão. */
  await page
    .locator("button")
    .filter({ hasText: "Adicionar foto ou vídeo" })
    .focus();
  await page.keyboard.press("Tab");
  await expect(ladrilho).toBeFocused();
  expect(
    await ladrilho.evaluate((el) => {
      const s = getComputedStyle(el);
      return { estilo: s.outlineStyle, deslocamento: s.outlineOffset };
    }),
  ).toEqual({ estilo: "solid", deslocamento: "-4px" });

  const [linha] = await fixtureDb()
    .select({
      id: schema.media.id,
      mimeType: schema.media.mimeType,
      width: schema.media.width,
      height: schema.media.height,
      durationMs: schema.media.durationMs,
      sizeBytes: schema.media.sizeBytes,
      purpose: schema.media.purpose,
      objectKey: schema.media.objectKey,
      thumbObjectKey: schema.media.thumbObjectKey,
    })
    .from(schema.media)
    .where(eq(schema.media.planId, PLANO_VIDEO));

  expect(linha).toMatchObject({
    mimeType: "video/mp4",
    purpose: "memory",
    // Gravado em pé: quadros deitados com rotação de 90° saem em pé.
    width: 180,
    height: 320,
  });
  expect(linha!.objectKey).toMatch(/\/full\.mp4$/);
  expect(linha!.thumbObjectKey).toMatch(/\/thumb\.webp$/);
  expect(linha!.durationMs).toBeGreaterThanOrEqual(7_800);
  expect(linha!.durationMs).toBeLessThanOrEqual(8_300);

  const url = `/api/media/${linha!.id}`;
  const tamanho = linha!.sizeBytes;

  // O pedido de dois bytes que o Safari faz antes de tocar.
  const doisBytes = await page.request.get(url, {
    headers: { Range: "bytes=0-1" },
  });
  expect(doisBytes.status()).toBe(206);
  expect(doisBytes.headers()["content-range"]).toBe(`bytes 0-1/${tamanho}`);
  expect(doisBytes.headers()["accept-ranges"]).toBe("bytes");
  expect(doisBytes.headers()["content-type"]).toBe("video/mp4");
  expect((await doisBytes.body()).length).toBe(2);

  // O arquivo inteiro, pedaço a pedaço, como o `<video>` lê.
  let corpo = Buffer.alloc(0);
  while (corpo.length < tamanho) {
    const pedaco = await page.request.get(url, {
      headers: { Range: `bytes=${corpo.length}-` },
    });
    expect(pedaco.status()).toBe(206);
    corpo = Buffer.concat([corpo, await pedaco.body()]);
  }
  expect(corpo.length).toBe(tamanho);

  // MP4 com o índice no começo: o player toca sem baixar o resto antes.
  expect(corpo.subarray(4, 8).toString("ascii")).toBe("ftyp");
  expect(corpo.indexOf("moov")).toBeGreaterThan(0);
  expect(corpo.indexOf("moov")).toBeLessThan(corpo.indexOf("mdat"));

  // A coordenada do celular não chegou ao bucket.
  expect(corpo.includes(Buffer.from(MARCADOR_GPS))).toBe(false);
  expect(corpo.includes(ATOMO_GPS)).toBe(false);

  // Pedir depois do fim é 416, com o tamanho para o player se situar.
  const alem = await page.request.get(url, {
    headers: { Range: `bytes=${tamanho}-` },
  });
  expect(alem.status()).toBe(416);
  expect(alem.headers()["content-range"]).toBe(`bytes */${tamanho}`);

  // O pôster é imagem, como toda miniatura.
  const poster = await page.request.get(`${url}?v=thumb`);
  expect(poster.status()).toBe(200);
  const posterCorpo = await poster.body();
  expect(posterCorpo.subarray(0, 4).toString("ascii")).toBe("RIFF");
  expect(posterCorpo.subarray(8, 12).toString("ascii")).toBe("WEBP");

  // Vídeo não vira capa: a estrela não existe, a remoção fala de vídeo.
  await expect(
    page.getByRole("button", { name: "Usar como capa" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Remover vídeo" }),
  ).toBeVisible();

  // E toca, em pé, pela rota autenticada — sozinho, porque foi pedido.
  await ladrilho.click();
  const player = page.getByRole("dialog", { name: /^Vídeo de / });
  const elemento = player.locator("video");
  await expect
    .poll(() => elemento.evaluate((v: HTMLVideoElement) => v.readyState), {
      timeout: 30_000,
    })
    .toBeGreaterThanOrEqual(2);

  const tocando = await elemento.evaluate((v: HTMLVideoElement) => ({
    largura: v.videoWidth,
    altura: v.videoHeight,
    duracao: v.duration,
    erro: v.error?.code ?? null,
  }));
  expect(tocando).toMatchObject({ largura: 180, altura: 320, erro: null });
  expect(tocando.duracao).toBeGreaterThan(7.5);
  expect(tocando.duracao).toBeLessThan(8.5);
  await expect
    .poll(() => elemento.evaluate((v: HTMLVideoElement) => v.paused))
    .toBe(false);

  // Com `prefers-reduced-motion`, o player abre parado no pôster.
  await page.keyboard.press("Escape");
  await expect(player).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ladrilho.click();
  await expect
    .poll(() => elemento.evaluate((v: HTMLVideoElement) => v.readyState), {
      timeout: 30_000,
    })
    .toBeGreaterThanOrEqual(1);
  expect(
    await elemento.evaluate((v: HTMLVideoElement) => ({
      parado: v.paused,
      tempo: v.currentTime,
    })),
  ).toEqual({ parado: true, tempo: 0 });
});

/**
 * O envio falha depois da conversão — sinal que caiu, assinatura vencida — e a
 * pessoa toca "Tentar de novo". Três provas:
 *
 * 1. o pôster sobe **antes** do vídeo, para as duas assinaturas, que vencem
 *    juntas, começarem a tempo mesmo num sinal fraco;
 * 2. a nova tentativa não converte de novo: a etapa "Preparando o vídeo" não
 *    reaparece;
 * 3. o vídeo termina salvo, uma linha só.
 *
 * A queda é simulada derrubando o primeiro PUT do vídeo na rede do navegador.
 */
test("o envio que falha depois da conversão tenta de novo sem converter outra vez", async ({
  page,
  audit,
}) => {
  audit.allowConsole(
    "net::ERR_FAILED",
    "o primeiro PUT do vídeo é derrubado de propósito para provar o reenvio",
  );

  await signIn(page);
  await limparMidiaDosPlanos([PLANO_VIDEO_REENVIO]);
  await page.goto(`/planos/${PLANO_VIDEO_REENVIO}`);

  const puts: string[] = [];
  page.on("request", (pedido) => {
    if (pedido.method() === "PUT") puts.push(pedido.url());
  });

  let derrubados = 0;
  await page.route(/\/full\.mp4\?/, async (rota) => {
    if (rota.request().method() === "PUT" && derrubados === 0) {
      derrubados += 1;
      await rota.abort("failed");
      return;
    }
    await rota.continue();
  });

  await page.locator('input[type="file"]').setInputFiles({
    name: "VID_20261011_201512.mp4",
    mimeType: "video/mp4",
    buffer: readFileSync("tests/e2e/fixtures/video-65s.mp4"),
  });

  const gaveta = page.getByRole("dialog", { name: "Escolha o trecho" });
  await expect(gaveta.getByText("Trecho de 1:00")).toBeVisible({
    timeout: 30_000,
  });
  await gaveta.getByRole("slider", { name: "Fim do trecho" }).fill("60");
  await gaveta.getByRole("button", { name: "Enviar trecho" }).click();

  await expect(gaveta.getByRole("alert")).toHaveText(/envio do vídeo falhou/, {
    timeout: 120_000,
  });
  expect(derrubados).toBe(1);

  // O pôster foi o primeiro PUT, e o vídeo o segundo.
  expect(
    puts.map((url) => (/\/thumb\.webp\?/.test(url) ? "thumb" : "full")),
  ).toEqual(["thumb", "full"]);

  /* Daqui em diante, qualquer aparição da etapa de conversão fica anotada. */
  await page.evaluate(() => {
    const janela = window as unknown as { __converteuDeNovo: boolean };
    janela.__converteuDeNovo = false;
    new MutationObserver(() => {
      if (
        document.querySelector(
          '[role="progressbar"][aria-label="Preparando o vídeo"]',
        )
      ) {
        janela.__converteuDeNovo = true;
      }
    }).observe(document.body, { subtree: true, childList: true });
  });

  await gaveta.getByRole("button", { name: "Tentar de novo" }).click();
  await expect(gaveta).toHaveCount(0, { timeout: 120_000 });
  await expect(
    page.getByRole("button", { name: /^Assistir ao vídeo de/ }),
  ).toBeVisible({ timeout: 30_000 });

  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __converteuDeNovo: boolean }).__converteuDeNovo,
    ),
  ).toBe(false);

  const linhas = await fixtureDb()
    .select({ id: schema.media.id, mimeType: schema.media.mimeType })
    .from(schema.media)
    .where(eq(schema.media.planId, PLANO_VIDEO_REENVIO));
  expect(linhas).toEqual([{ id: expect.any(String), mimeType: "video/mp4" }]);

  /* O pôster da tentativa derrubada subiu e nunca virou linha: órfão por
     desenho (D-053), mas não é motivo para o teste deixar lixo no bucket. */
  const bucket = process.env.R2_BUCKET ?? "date-media-dev";
  const orfao = new URL(puts[0]!).pathname.replace(`/${bucket}/`, "");
  expect(orfao).toContain(`/${PLANO_VIDEO_REENVIO}/`);
  await removerObjetos([orfao]);
});

/**
 * Os dois arquivos subiram e o que caiu foi a confirmação. O "Tentar de
 * novo" só confirma: nada é assinado de novo, nada sobe de novo, e não ficam
 * 40 MB órfãos no bucket por tentativa.
 *
 * A confirmação é a Server Action que leva `"kind":"video"` no corpo; a
 * primeira é derrubada na rede do navegador, antes de chegar ao servidor.
 */
test("a confirmação que caiu é refeita sem subir o vídeo de novo", async ({
  page,
  audit,
}) => {
  audit.allowConsole(
    "net::ERR_FAILED",
    "a primeira confirmação é derrubada de propósito para provar o reenvio",
  );

  await signIn(page);
  await limparMidiaDosPlanos([PLANO_VIDEO_CONFIRMA]);
  await page.goto(`/planos/${PLANO_VIDEO_CONFIRMA}`);

  const puts: string[] = [];
  let assinaturas = 0;
  let confirmacoes = 0;

  page.on("request", (pedido) => {
    if (pedido.method() === "PUT") puts.push(pedido.url());
    if (
      pedido.method() === "POST" &&
      (pedido.postData() ?? "").includes('"contentType":"video/mp4"')
    ) {
      assinaturas += 1;
    }
  });

  await page.route(`**/planos/${PLANO_VIDEO_CONFIRMA}`, async (rota) => {
    const pedido = rota.request();
    if (
      pedido.method() === "POST" &&
      (pedido.postData() ?? "").includes('"kind":"video"')
    ) {
      confirmacoes += 1;
      if (confirmacoes === 1) {
        await rota.abort("failed");
        return;
      }
    }
    await rota.continue();
  });

  await page.locator('input[type="file"]').setInputFiles({
    name: "VID_20261011_201512.mp4",
    mimeType: "video/mp4",
    buffer: readFileSync("tests/e2e/fixtures/video-65s.mp4"),
  });

  const gaveta = page.getByRole("dialog", { name: "Escolha o trecho" });
  await expect(gaveta.getByText("Trecho de 1:00")).toBeVisible({
    timeout: 30_000,
  });
  await gaveta.getByRole("slider", { name: "Fim do trecho" }).fill("50");
  await gaveta.getByRole("button", { name: "Enviar trecho" }).click();

  await expect(gaveta.getByRole("alert")).toHaveText(/Algo deu errado/, {
    timeout: 120_000,
  });
  expect(confirmacoes).toBe(1);
  expect(assinaturas).toBe(1);
  expect(puts).toHaveLength(2);

  await gaveta.getByRole("button", { name: "Tentar de novo" }).click();
  await expect(gaveta).toHaveCount(0, { timeout: 60_000 });
  await expect(
    page.getByRole("button", { name: /^Assistir ao vídeo de/ }),
  ).toBeVisible({ timeout: 30_000 });

  // Só a confirmação foi refeita: nenhuma assinatura nova, nenhum PUT novo.
  expect(confirmacoes).toBe(2);
  expect(assinaturas).toBe(1);
  expect(puts).toHaveLength(2);

  const linhas = await fixtureDb()
    .select({ id: schema.media.id })
    .from(schema.media)
    .where(eq(schema.media.planId, PLANO_VIDEO_CONFIRMA));
  expect(linhas).toHaveLength(1);
});

test("vídeo escolhido na capa é recusado com uma frase, sem abrir o corte", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/planos/${PLANO_VIDEO_CAPA}`);

  await page.getByRole("button", { name: "Editar detalhes" }).click();
  const gaveta = page.getByRole("dialog", { name: "Editar detalhes" });
  await expect(gaveta).toBeVisible();

  await gaveta.locator('input[type="file"]').setInputFiles({
    name: "VID_20261011_201512.mp4",
    mimeType: "video/mp4",
    buffer: readFileSync("tests/e2e/fixtures/video-65s.mp4"),
  });

  await expect(gaveta.getByRole("alert")).toHaveText(
    /A capa precisa ser uma foto/,
  );
  await expect(
    page.getByRole("dialog", { name: "Escolha o trecho" }),
  ).toHaveCount(0);
});

/**
 * A gaveta de corte medida como a grade de fotos: alvo de toque, texto
 * mínimo, sobra horizontal — e o axe sobre ela aberta, porque nenhuma rota da
 * varredura do `a11y.spec.ts` a mostra.
 */
for (const largura of [320, 390, 1280] as const) {
  test(`medidas da gaveta de corte de vídeo em ${largura}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: largura, height: 800 });
    await signIn(page);
    await page.goto(`/planos/${PLANO_VIDEO_MEDIDAS}`);

    await page.locator('input[type="file"]').setInputFiles({
      name: "VID_20261011_201512.mp4",
      mimeType: "video/mp4",
      buffer: readFileSync("tests/e2e/fixtures/video-65s.mp4"),
    });

    const gaveta = page.getByRole("dialog", { name: "Escolha o trecho" });
    await expect(gaveta.getByText("Trecho de 1:00")).toBeVisible({
      timeout: 30_000,
    });

    const medidas = await gaveta.evaluate((raiz) => {
      const pequenos: string[] = [];
      const miudos: string[] = [];

      for (const el of raiz.querySelectorAll<HTMLElement>(
        "button, a, input, [role='button']",
      )) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (r.width < 44 || r.height < 44) {
          pequenos.push(
            `${el.tagName.toLowerCase()}[${el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 24) ?? ""}] ${Math.round(r.width)}x${Math.round(r.height)}`,
          );
        }
      }

      for (const el of raiz.querySelectorAll<HTMLElement>("*")) {
        if (!el.textContent?.trim() || el.children.length > 0) continue;
        const tamanho = Number.parseFloat(getComputedStyle(el).fontSize);
        if (tamanho > 0 && tamanho < 12) {
          miudos.push(`${el.tagName.toLowerCase()} ${tamanho}px`);
        }
      }

      const documento = document.documentElement;
      return {
        pequenos,
        miudos,
        sobra: raiz.scrollWidth > raiz.clientWidth,
        scrollHorizontal: documento.scrollWidth > documento.clientWidth,
      };
    });

    expect(medidas.pequenos, "alvos de toque abaixo de 44px").toEqual([]);
    expect(medidas.miudos, "texto abaixo de 12px").toEqual([]);
    expect(medidas.sobra, "a gaveta transborda na horizontal").toBe(false);
    expect(medidas.scrollHorizontal, "scroll horizontal na página").toBe(false);

    /* O foco por teclado chega nas alças e o anel aparece. */
    await gaveta.getByRole("slider", { name: "Início do trecho" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(
      gaveta.getByRole("slider", { name: "Início do trecho" }),
    ).toHaveValue("1");

    const axe = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const graves = axe.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id}: ${v.help}`);
    expect(graves, "violações graves do axe na gaveta").toEqual([]);

    // Cancelar fecha sem enviar nada.
    await gaveta.getByRole("button", { name: "Cancelar" }).click();
    await expect(gaveta).toHaveCount(0);

    const linhas = await fixtureDb()
      .select({ id: schema.media.id })
      .from(schema.media)
      .where(eq(schema.media.planId, PLANO_VIDEO_MEDIDAS));
    expect(linhas).toEqual([]);
  });
}

/**
 * Alças encostadas, com o dedo de verdade. Com o trecho de um segundo num
 * vídeo de 65 s, as duas alças de 44px ficam quase uma em cima da outra; sem
 * a divisão pelo ponto médio, a de cima tomaria todo toque e a outra ficaria
 * inalcançável. Aqui se aperta 6px de cada lado do meio e se arrasta.
 */
test("alças encostadas: o lado esquerdo pega o início, o direito pega o fim", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.goto(`/planos/${PLANO_VIDEO_MEDIDAS}`);

  await page.locator('input[type="file"]').setInputFiles({
    name: "VID_20261011_201512.mp4",
    mimeType: "video/mp4",
    buffer: readFileSync("tests/e2e/fixtures/video-65s.mp4"),
  });

  const gaveta = page.getByRole("dialog", { name: "Escolha o trecho" });
  await expect(gaveta.getByText("Trecho de 1:00")).toBeVisible({
    timeout: 30_000,
  });

  const inicio = gaveta.getByRole("slider", { name: "Início do trecho" });
  const fim = gaveta.getByRole("slider", { name: "Fim do trecho" });

  // Trecho de 9,0 s a 10,0 s: um segundo, as alças a poucos pixels.
  await fim.fill("100");
  await inicio.fill("90");
  await expect(gaveta.getByText("Trecho de 0:01")).toBeVisible();

  /* Aperta a `deslocamento` px do ponto médio entre as alças (9,5 s) e
     arrasta 60px para o mesmo lado. A caixa é medida a cada vez: o `fill`
     rola a gaveta para mostrar a alça, e uma posição medida antes da rolagem
     apertaria o vazio. */
  async function arrastarDoMeio(deslocamento: number): Promise<void> {
    await inicio.scrollIntoViewIfNeeded();
    const caixa = await inicio.boundingBox();
    const maximo = Number(await inicio.getAttribute("max"));
    if (!caixa || !maximo) throw new Error("A régua não tem caixa nem máximo.");

    const meio = caixa.x + 22 + (caixa.width - 44) * (95 / maximo);
    const y = caixa.y + caixa.height / 2;
    const sentido = Math.sign(deslocamento);

    await page.mouse.move(meio + deslocamento, y);
    await page.mouse.down();
    await page.mouse.move(meio + deslocamento + sentido * 60, y, { steps: 6 });
    await page.mouse.up();
  }

  // À esquerda do meio, arrastando para trás: mexe o início, não o fim.
  await arrastarDoMeio(-6);
  expect(Number(await inicio.inputValue())).toBeLessThan(90);
  await expect(fim).toHaveValue("100");

  // De volta ao trecho de um segundo, e agora à direita do meio, para frente.
  await inicio.fill("90");
  await expect(gaveta.getByText("Trecho de 0:01")).toBeVisible();
  await arrastarDoMeio(6);
  expect(Number(await fim.inputValue())).toBeGreaterThan(100);
  await expect(inicio).toHaveValue("90");

  await gaveta.getByRole("button", { name: "Cancelar" }).click();
  await expect(gaveta).toHaveCount(0);
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
