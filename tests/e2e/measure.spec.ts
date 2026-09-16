import { deflateSync } from "node:zlib";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { inArray } from "drizzle-orm";

import { parseDevCredentials } from "@/lib/auth/dev-provisioning";
import { resolveR2 } from "@/features/media/r2/env.ts";

import { expect, test, type Page } from "./harness.ts";
import { signInForFeature } from "./feature-session.ts";
import { closeFixtureDb, fixtureDb, schema } from "./db-fixture.ts";

/**
 * Medição da seção 10 do docs/PWA_AND_HARDENING.md.
 *
 * O orçamento de JavaScript **não** é portão aqui (linha de corte do B11): os
 * números são impressos para o relatório e a decisão do que fazer com eles é do
 * proprietário. O que é portão é a contagem de miniatura, porque servir a
 * imagem cheia numa grade não tem sintoma nenhum no desktop de quem desenvolve
 * e inviabiliza a grade no celular.
 *
 * O fixture é de 30 planos com foto, não os oito do seed: a diferença entre oito
 * e trinta é justamente o que se quer enxergar.
 *
 * Ressalva registrada: as imagens do fixture são PNG, porque não há encoder
 * WebP disponível em Node aqui. O produto sempre grava WebP, então os bytes
 * abaixo são **teto**, não o valor de produção. A contagem de requisições, que
 * é o que vira portão, não depende do formato.
 */

const credentials = parseDevCredentials(process.env.DATE_DEV_USER_CREDENTIALS);
const account =
  credentials.find(
    (c) => c.email === (process.env.DATE_TEST_EMAIL ?? "").toLowerCase(),
  ) ?? credentials[0]!;

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const QUANTOS = 30;
const MARCA = crypto.randomUUID().slice(0, 8);
const planIds = Array.from({ length: QUANTOS }, () => crypto.randomUUID());
const mediaIds = Array.from({ length: QUANTOS }, () => crypto.randomUUID());

/** PNG sólido de tamanho dado. Serve para medir transferência, não para ver. */
function png(edge: number): Buffer {
  const raw = Buffer.alloc(edge * (edge * 3 + 1));
  for (let y = 0; y < edge; y++) {
    const linha = y * (edge * 3 + 1);
    raw[linha] = 0;
    for (let x = 0; x < edge; x++) {
      const d = linha + 1 + x * 3;
      /* Ruído determinístico: um PNG de cor chapada comprime a quase nada e a
         medição de bytes deixaria de significar qualquer coisa. */
      raw[d] = (x * 7 + y * 13) & 0xff;
      raw[d + 1] = (x * 3 + y * 5) & 0xff;
      raw[d + 2] = (x * 11 + y * 2) & 0xff;
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(edge, 0);
  ihdr.writeUInt32BE(edge, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 6 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

let r2: S3Client;
let bucket = "";
const objectKeys: string[] = [];

test.beforeAll(async () => {
  const { config, target } = resolveR2(process.env);
  expect(
    target.bucket,
    "a medição só roda contra o bucket de development",
  ).toBe("date-media-dev");
  bucket = config.bucket;
  r2 = new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  const cheia = png(1200);
  const mini = png(320);

  const db = fixtureDb();
  await db.insert(schema.plans).values(
    planIds.map((id, i) => ({
      id,
      workspaceId: WORKSPACE,
      createdBy: "seed_profile_alex",
      title: `Medição ${MARCA} ${String(i + 1).padStart(2, "0")}`,
      category: "cultura",
      status: "idea" as const,
    })),
  );

  for (let i = 0; i < QUANTOS; i++) {
    const base = `${WORKSPACE}/${planIds[i]}/${mediaIds[i]}`;
    /* A chave termina em .webp porque `assertKeyBelongsToWorkspace` exige esse
   formato — chave fora do padrao gerado pelo servidor vira erro, de proposito.
   O corpo e um PNG e o content-type gravado e image/png, que esta na allowlist:
   o navegador decodifica pelo content-type, nao pela extensao da chave. */
    const full = `${base}/full.webp`;
    const thumb = `${base}/thumb.webp`;
    objectKeys.push(full, thumb);
    await Promise.all([
      r2.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: full,
          Body: cheia,
          ContentType: "image/png",
        }),
      ),
      r2.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: thumb,
          Body: mini,
          ContentType: "image/png",
        }),
      ),
    ]);
  }

  await db.insert(schema.media).values(
    mediaIds.map((id, i) => ({
      id,
      workspaceId: WORKSPACE,
      objectKey: `${WORKSPACE}/${planIds[i]}/${id}/full.webp`,
      thumbObjectKey: `${WORKSPACE}/${planIds[i]}/${id}/thumb.webp`,
      mimeType: "image/png",
      sizeBytes: cheia.length,
      width: 1200,
      height: 1200,
      purpose: "cover" as const,
      planId: planIds[i],
      uploadedBy: "seed_profile_alex",
    })),
  );

  for (let i = 0; i < QUANTOS; i++) {
    await db
      .update(schema.plans)
      .set({ coverMediaId: mediaIds[i] })
      .where(inArray(schema.plans.id, [planIds[i]!]));
  }

  console.log(
    `fixture: ${QUANTOS} planos com foto | cheia ${cheia.length} B | miniatura ${mini.length} B`,
  );
});

test.afterAll(async () => {
  const db = fixtureDb();
  await db
    .update(schema.plans)
    .set({ coverMediaId: null })
    .where(inArray(schema.plans.id, planIds));
  await db.delete(schema.media).where(inArray(schema.media.id, mediaIds));
  await db.delete(schema.plans).where(inArray(schema.plans.id, planIds));

  const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  for (const Key of objectKeys) {
    await r2
      .send(new DeleteObjectCommand({ Bucket: bucket, Key }))
      .catch(() => {});
  }
  await closeFixtureDb();
});

type Coleta = {
  imagens: { url: string; bytes: number }[];
  scripts: { url: string; bytes: number }[];
};

/**
 * Bytes vêm de `request().sizes()`, não do `content-length`: o Next serve os
 * bundles com codificação em pedaços e sem esse header, e a primeira versão
 * desta medição imprimiu 0,0 kB de JavaScript em todas as rotas — número limpo,
 * instrumento quebrado.
 */
async function coletar(page: Page, url: string): Promise<Coleta> {
  const respostas: import("@playwright/test").Response[] = [];
  page.on("response", (response) => respostas.push(response));

  await page.goto(url);
  /* Rolar até o fim antes de medir: as imagens abaixo da dobra são preguiçosas
     e ficariam de fora da conta. Sem isto, "30 planos com foto" vira "as 18 que
     couberam na primeira tela". */
  await page.evaluate(async () => {
    const passo = window.innerHeight;
    for (let y = 0; y < document.body.scrollHeight; y += passo) {
      window.scrollTo(0, y);
      await new Promise((resolve) =>
        requestAnimationFrame(() => resolve(null)),
      );
    }
    window.scrollTo(0, 0);
  });
  /* Asserção que espera, nunca waitForTimeout: a rede fica quieta quando as
     imagens terminaram. */
  await page.waitForLoadState("networkidle");

  const coleta: Coleta = { imagens: [], scripts: [] };
  for (const response of respostas) {
    const tipo = response.headers()["content-type"] ?? "";
    if (!tipo.startsWith("image/") && !tipo.includes("javascript")) continue;
    let bytes = 0;
    try {
      /* `sizes().responseBodySize` devolve -1 quando o navegador não rastreou a
         resposta, e a soma saía negativa. O corpo decodificado sempre existe —
         para JavaScript ele é maior que o transferido, porque o servidor
         comprime; para imagem os dois coincidem. */
      bytes = (await response.body()).length;
    } catch {
      // Resposta já descartada pelo navegador; entra na contagem com zero byte.
    }
    const item = { url: response.url(), bytes };
    if (tipo.startsWith("image/")) coleta.imagens.push(item);
    else coleta.scripts.push(item);
  }
  return coleta;
}

function somar(itens: { bytes: number }[]): number {
  return itens.reduce((total, item) => total + item.bytes, 0);
}

/**
 * Cookies capturados uma vez e injetados em cada contexto novo.
 *
 * Toda medição abre contexto próprio porque o cache do navegador é por
 * contexto: medindo tudo na mesma aba, a segunda rota herda as imagens e os
 * chunks da primeira e imprime 0 B — número limpo, medição nenhuma. Injetar o
 * cookie em vez de logar de novo mantém um único login no provedor.
 */
let cookiesDaSessao: Awaited<
  ReturnType<import("@playwright/test").BrowserContext["cookies"]>
> = [];

test.beforeAll(async ({ browser }) => {
  const contexto = await browser.newContext();
  const pagina = await contexto.newPage();
  await signInForFeature(pagina, account);
  cookiesDaSessao = await contexto.cookies();
  await contexto.close();
});

async function paginaFria(
  browser: import("@playwright/test").Browser,
): Promise<{ pagina: Page; fechar: () => Promise<void> }> {
  const contexto = await browser.newContext();
  await contexto.addCookies(cookiesDaSessao);
  const pagina = await contexto.newPage();
  return { pagina, fechar: () => contexto.close() };
}

test.describe("bytes de imagem", () => {
  /* Em série: o fixture de 30 planos é estado global do workspace, e duas
     medições concorrentes contariam as requisições uma da outra. */
  test.describe.configure({ mode: "serial" });

  for (const rota of ["/ideias", "/memorias", "/agenda"] as const) {
    test(`${rota} pede só miniatura`, async ({ browser }) => {
      const { pagina: page, fechar } = await paginaFria(browser);
      const coleta = await coletar(page, rota);

      const daRota = coleta.imagens.filter((i) =>
        i.url.includes("/api/media/"),
      );
      const semThumb = daRota.filter((i) => !i.url.includes("v=thumb"));

      console.log(
        `${rota}: ${daRota.length} imagem(ns) de mídia, ${somar(daRota)} B, ` +
          `${semThumb.length} sem ?v=thumb`,
      );

      expect(semThumb.map((i) => i.url)).toEqual([]);
      await fechar();
    });
  }

  test("/planos/[id] usa a cheia na capa", async ({ browser }) => {
    const { pagina: page, fechar } = await paginaFria(browser);
    const coleta = await coletar(page, `/planos/${planIds[0]}`);

    const daRota = coleta.imagens.filter((i) => i.url.includes("/api/media/"));
    const cheias = daRota.filter((i) => !i.url.includes("v=thumb"));

    console.log(
      `/planos/[id]: ${daRota.length} imagem(ns), ${somar(daRota)} B, ` +
        `${cheias.length} cheia(s)`,
    );

    // A capa é a cheia, e é **uma** cheia. A galeria continua em miniatura.
    expect(cheias.length).toBe(1);
    await fechar();
  });
});

test.describe("JavaScript por rota", () => {
  /* Medida, não portão: o orçamento como portão saiu pela linha de corte do
     B11. O número existe para a decisão do proprietário.
   *
   * Cada rota mede em **contexto novo**, com os cookies injetados sem navegar
   * antes. Medir na mesma aba faria a segunda rota herdar os chunks da primeira
   * pelo cache do navegador, e o número viraria "o que sobrou", não "o que a
   * rota custa para quem abre ela primeiro". */
  for (const rota of ["/", "/ideias", "/agenda", "/login"] as const) {
    test(`${rota} — quanto de JS numa primeira visita`, async ({ browser }) => {
      const { pagina, fechar } = await paginaFria(browser);
      const coleta = await coletar(pagina, rota);
      const total = somar(coleta.scripts);
      console.log(
        `JS ${rota.padEnd(10)} ${String(coleta.scripts.length).padStart(2)} arquivo(s) ` +
          `${(total / 1024).toFixed(1)} kB decodificados`,
      );

      expect(coleta.scripts.length).toBeGreaterThan(0);
      await fechar();
    });
  }
});
