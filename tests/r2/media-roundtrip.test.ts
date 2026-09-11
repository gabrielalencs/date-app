import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@/db/schema/index.ts";
import { MAX_BYTES } from "@/features/media/constants";
import {
  confirmUpload,
  removeMedia,
  startUpload,
} from "@/features/media/data/mutations";
import { getMediaObject } from "@/features/media/data/queries";
import {
  deleteObjects,
  getObject,
  headObject,
  r2Target,
} from "@/features/media/r2/client";
import { buildObjectKeys } from "@/features/media/r2/object-key";
import type { AuthorizedContext } from "@/lib/auth/authorization-core";
import { NotFoundError, ValidationError } from "@/lib/errors";

/**
 * O ciclo completo contra o `date-media-dev` de verdade: assina, sobe pelo PUT
 * assinado, confirma, lê os bytes de volta, remove, e confere que o objeto
 * sumiu do bucket.
 *
 * Fica fora do `pnpm test` de propósito — roda por `pnpm test:media`, e o
 * portão continua verde numa máquina sem credencial de R2.
 *
 * Usa um plano temporário próprio no workspace A e limpa o plano e a mídia
 * ao terminar. Executar separadamente da suíte de contagem do seed.
 */
const WORKSPACE_A = "11111111-1111-4111-8111-111111111111";
const PROFILE_A = "seed_profile_alex";
const PLANO = crypto.randomUUID();

const ctx: AuthorizedContext = {
  userId: PROFILE_A,
  profileId: PROFILE_A,
  workspaceId: WORKSPACE_A,
  role: "owner",
};

type DatabaseModule = typeof import("@/db/client.ts");
let databaseModule: DatabaseModule | undefined;
let database: DatabaseModule["db"];

/* Não é imagem de verdade e não precisa ser: o servidor nunca decodifica. Ele
   confere MIME e tamanho pelo que o R2 reporta, e é isso que está sob teste. */
/** Assinatura reconhecível: se estes bytes aparecerem numa resposta, vazou. */
const RECHEIO_FULL = "DATE-B5-FULL";
const RECHEIO_THUMB = "DATE-B5-THUMB";

const FULL = new Blob([RECHEIO_FULL.repeat(256)], { type: "image/webp" });
const THUMB = new Blob([RECHEIO_THUMB.repeat(32)], { type: "image/webp" });

const criadas: string[] = [];
/* Todo uploadId assinado, confirmado ou não. Os que não viraram linha deixam
   objeto órfão — comportamento correto por desenho (D-053), mas não é motivo
   para o teste sujar o bucket a cada execução. */
const assinados: string[] = [];

async function put(
  url: string,
  body: Blob,
  contentType = "image/webp",
): Promise<number> {
  const response = await fetch(url, {
    method: "PUT",
    headers: { "content-type": contentType },
    body,
  });
  return response.status;
}

async function assinarESubir() {
  const started = await assinar();

  expect(await put(started.full.url, FULL)).toBe(200);
  expect(await put(started.thumb.url, THUMB)).toBe(200);

  return started;
}

/** Assina e anota o uploadId, para a limpeza alcançar até o que não confirmou. */
async function assinar() {
  const started = await startUpload(ctx, {
    planId: PLANO,
    purpose: "gallery",
    contentType: "image/webp",
    sizes: { full: FULL.size, thumb: THUMB.size },
  });

  assinados.push(started.uploadId);
  return started;
}

beforeAll(async () => {
  if (process.env.NEON_BRANCH !== "development") {
    throw new Error("ABORTADO: test:media exige NEON_BRANCH=development.");
  }

  const alvo = r2Target();
  if (alvo.bucket !== "date-media-dev") {
    throw new Error(`ABORTADO: bucket ${alvo.bucket} não é o de development.`);
  }
  console.log(`R2 bucket   : ${alvo.bucket}`);
  console.log(`R2 endpoint : ${alvo.endpoint}`);

  databaseModule = await import("@/db/client.ts");
  database = databaseModule.db;
  await database.insert(schema.plans).values({
    id: PLANO,
    workspaceId: WORKSPACE_A,
    createdBy: PROFILE_A,
    title: "Teste R2 isolado",
    category: "outro",
  });
});

afterAll(async () => {
  if (!database) return;
  for (const id of criadas) {
    await removeMedia(ctx, id).catch(() => {});
  }

  await database
    .delete(schema.media)
    .where(eq(schema.media.planId, PLANO))
    .catch(() => {});

  // Órfãos deixados de propósito pelos casos negativos.
  for (const uploadId of assinados) {
    const keys = buildObjectKeys({
      workspaceId: WORKSPACE_A,
      planId: PLANO,
      mediaUuid: uploadId,
    });
    await deleteObjects([keys.full, keys.thumb]);
  }

  await database.delete(schema.plans).where(eq(schema.plans.id, PLANO));
  await databaseModule?.closeDatabasePool();
});

describe("ciclo completo contra o date-media-dev", () => {
  it("assina, sobe, confirma, lê e remove", async () => {
    const started = await assinarESubir();

    const row = await confirmUpload(ctx, {
      planId: PLANO,
      uploadId: started.uploadId,
      purpose: "gallery",
      width: 2000,
      height: 1500,
    });
    criadas.push(row.id);

    // A chave nasceu no servidor, com o workspace no prefixo.
    expect(row.objectKey).toBe(
      buildObjectKeys({
        workspaceId: WORKSPACE_A,
        planId: PLANO,
        mediaUuid: started.uploadId,
      }).full,
    );

    // Lê pelo mesmo caminho da rota: resolve a linha escopada, depois o objeto.
    const alvo = await getMediaObject(ctx, row.id, "full");
    const objeto = await getObject(alvo.objectKey);
    expect(objeto).not.toBeNull();
    const bytes = await new Response(objeto!.body).arrayBuffer();
    expect(bytes.byteLength).toBe(FULL.size);

    const miniatura = await getMediaObject(ctx, row.id, "thumb");
    const objetoThumb = await getObject(miniatura.objectKey);
    expect(objetoThumb).not.toBeNull();
    expect(
      (await new Response(objetoThumb!.body).arrayBuffer()).byteLength,
    ).toBe(THUMB.size);

    // Remove: a linha sai primeiro, o objeto depois.
    const { orfaos } = await removeMedia(ctx, row.id);
    criadas.pop();
    expect(orfaos).toEqual([]);

    await expect(getMediaObject(ctx, row.id, "full")).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(await headObject(alvo.objectKey)).toBeNull();
    expect(await headObject(miniatura.objectKey)).toBeNull();
  });

  it("grava o tamanho e o MIME que o R2 reporta, não os que o cliente declarou", async () => {
    const started = await assinarESubir();

    const row = await confirmUpload(ctx, {
      planId: PLANO,
      uploadId: started.uploadId,
      purpose: "gallery",
      // Dimensões são do cliente e não têm como ser conferidas no servidor.
      width: 2000,
      height: 1500,
    });
    criadas.push(row.id);

    const doR2 = await headObject(row.objectKey);

    expect(row.sizeBytes).toBe(doR2!.sizeBytes);
    expect(row.sizeBytes).toBe(FULL.size);
    expect(row.mimeType).toBe(doR2!.contentType);
    expect(row.mimeType).toBe("image/webp");
    expect(row.sizeBytes).toBeLessThanOrEqual(MAX_BYTES.full);
  });

  it("confirmação sem objeto no bucket não cria linha nenhuma", async () => {
    const antes = await database
      .select({ id: schema.media.id })
      .from(schema.media)
      .where(eq(schema.media.planId, PLANO));

    /* Assina mas NÃO sobe: é o cliente dizendo "terminei" sem ter terminado. */
    const started = await assinar();

    await expect(
      confirmUpload(ctx, {
        planId: PLANO,
        uploadId: started.uploadId,
        purpose: "gallery",
        width: 2000,
        height: 1500,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);

    const depois = await database
      .select({ id: schema.media.id })
      .from(schema.media)
      .where(eq(schema.media.planId, PLANO));

    expect(depois.length).toBe(antes.length);
  });

  it("confirmação com só uma das duas variantes no bucket também falha", async () => {
    const started = await assinar();

    expect(await put(started.full.url, FULL)).toBe(200);
    // O thumb não sobe.

    await expect(
      confirmUpload(ctx, {
        planId: PLANO,
        uploadId: started.uploadId,
        purpose: "gallery",
        width: 2000,
        height: 1500,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("o R2 recusa PUT com content-type diferente do assinado", async () => {
    const started = await assinar();

    expect(await put(started.full.url, FULL, "text/html")).toBe(403);
  });

  it("o R2 recusa PUT com corpo maior que o tamanho assinado", async () => {
    const started = await assinar();

    const maior = new Blob([FULL, FULL], { type: "image/webp" });
    expect(await put(started.full.url, maior)).toBe(403);
  });

  it("o servidor recusa assinar acima do teto, antes de existir URL", async () => {
    await expect(
      startUpload(ctx, {
        planId: PLANO,
        purpose: "gallery",
        contentType: "image/webp",
        sizes: { full: MAX_BYTES.full + 1, thumb: THUMB.size },
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("o bucket é privado: GET sem credencial não devolve o objeto", async () => {
    const started = await assinarESubir();
    const row = await confirmUpload(ctx, {
      planId: PLANO,
      uploadId: started.uploadId,
      purpose: "gallery",
      width: 2000,
      height: 1500,
    });
    criadas.push(row.id);

    const semCredencial = await fetch(
      `${process.env.R2_ENDPOINT}/${process.env.R2_BUCKET}/${row.objectKey}`,
    );

    const corpo = await semCredencial.text();

    expect(semCredencial.ok).toBe(false);
    // Recusa do S3, e não os bytes do objeto.
    expect(corpo).toContain("<Error>");
    expect(corpo).not.toContain(RECHEIO_FULL);
  });
});
