import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@/db/schema/index.ts";
import {
  clearPlanCover,
  removeMedia,
  reorderPlanMedia,
  setPlanCover,
  startUpload,
} from "@/features/media/data/mutations";
import { getMediaObject, listPlanMedia } from "@/features/media/data/queries";
import { buildObjectKeys } from "@/features/media/r2/object-key";
import { createPlan } from "@/features/plans/data/mutations";
import { getPlan } from "@/features/plans/data/queries";
import type { AuthorizedContext } from "@/lib/auth/authorization-core";
import { NotFoundError, ValidationError } from "@/lib/errors";

/**
 * Dois workspaces, de novo — agora para mídia.
 *
 * As linhas de `media` são inseridas direto, sem passar pelo R2: todo caminho
 * negativo testado aqui (ler, listar, remover, virar capa, reordenar do
 * workspace errado) lança antes de qualquer chamada ao bucket. Por isso este
 * arquivo roda no `test:db` e não precisa de credencial do R2.
 *
 * O round-trip real contra o `date-media-dev` vive em `tests/r2/`, sob o
 * `pnpm test:media`, e não entra no `pnpm test`.
 */
const WORKSPACE_A = "11111111-1111-4111-8111-111111111111";
/* Plano do seed, não criado aqui: o database.integration.test.ts afirma que o
   workspace A tem exatamente os oito ids do seed, e criar um nono faria os dois
   arquivos brigarem por qual estado do banco é o certo. */
const PLANO_DO_SEED_A = "22222222-0000-4000-8000-000000000001";
const WORKSPACE_B = "55555555-5555-4555-8555-555555555555";
const PROFILE_A = "seed_profile_alex";
const PROFILE_B = "seed_profile_media_b";

type DatabaseModule = typeof import("@/db/client.ts");
let databaseModule: DatabaseModule | undefined;
let database: DatabaseModule["db"];

const ctxA: AuthorizedContext = {
  userId: PROFILE_A,
  profileId: PROFILE_A,
  workspaceId: WORKSPACE_A,
  role: "owner",
};

const ctxB: AuthorizedContext = {
  userId: PROFILE_B,
  profileId: PROFILE_B,
  workspaceId: WORKSPACE_B,
  role: "owner",
};

let planoDeB = "";
let midiaDeB1 = "";
let midiaDeB2 = "";

/** Insere a linha sem R2: aqui interessa o escopo, não os bytes. */
async function inserirMidia(
  ctx: AuthorizedContext,
  planId: string,
  purpose: "cover" | "gallery",
  position: number,
): Promise<string> {
  const keys = buildObjectKeys({
    workspaceId: ctx.workspaceId,
    planId,
    mediaUuid: crypto.randomUUID(),
  });

  const [row] = await database
    .insert(schema.media)
    .values({
      workspaceId: ctx.workspaceId,
      planId,
      objectKey: keys.full,
      thumbObjectKey: keys.thumb,
      mimeType: "image/webp",
      sizeBytes: 1234,
      width: 2000,
      height: 1500,
      purpose,
      position,
      uploadedBy: ctx.profileId,
    })
    .returning({ id: schema.media.id });

  return row!.id;
}

beforeAll(async () => {
  if (process.env.NEON_BRANCH !== "development") {
    throw new Error("ABORTADO: test:db exige NEON_BRANCH=development.");
  }

  databaseModule = await import("@/db/client.ts");
  database = databaseModule.db;

  await database
    .insert(schema.workspaces)
    .values({ id: WORKSPACE_B, name: "Workspace de mídia B" })
    .onConflictDoNothing();
  await database
    .insert(schema.profiles)
    .values({ id: PROFILE_B, displayName: "Pessoa da mídia B" })
    .onConflictDoNothing();
  await database
    .insert(schema.workspaceMembers)
    .values({ workspaceId: WORKSPACE_B, profileId: PROFILE_B, role: "owner" })
    .onConflictDoNothing();

  planoDeB = (
    await createPlan(ctxB, { title: "Plano com fotos do B", category: "outro" })
  ).id;

  midiaDeB1 = await inserirMidia(ctxB, planoDeB, "cover", 0);
  midiaDeB2 = await inserirMidia(ctxB, planoDeB, "gallery", 1);

  await setPlanCover(ctxB, planoDeB, midiaDeB1);
});

afterAll(async () => {
  // Cascata leva media, plans e membership do B junto.
  await database
    .delete(schema.workspaces)
    .where(eq(schema.workspaces.id, WORKSPACE_B));
  await database
    .delete(schema.profiles)
    .where(eq(schema.profiles.id, PROFILE_B));

  await databaseModule?.closeDatabasePool();
});

describe("leitura de mídia não atravessa o workspace", () => {
  it("getMediaObject do A não encontra a mídia do B", async () => {
    await expect(
      getMediaObject(ctxA, midiaDeB1, "full"),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      getMediaObject(ctxA, midiaDeB1, "thumb"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("o B encontra a própria mídia, nas duas variantes", async () => {
    const full = await getMediaObject(ctxB, midiaDeB1, "full");
    const thumb = await getMediaObject(ctxB, midiaDeB1, "thumb");

    expect(full.objectKey).toMatch(/\/full\.webp$/);
    expect(thumb.objectKey).toMatch(/\/thumb\.webp$/);
    // A chave carrega o workspace no prefixo — auditável a olho.
    expect(full.objectKey.startsWith(`${WORKSPACE_B}/`)).toBe(true);
  });

  it("listPlanMedia do A não devolve foto do plano do B", async () => {
    const lista = await listPlanMedia(ctxA, planoDeB);
    expect(lista).toHaveLength(0);
  });

  it("o B lista as próprias fotos, em ordem de position", async () => {
    const lista = await listPlanMedia(ctxB, planoDeB);
    expect(lista.map((f) => f.id)).toEqual([midiaDeB1, midiaDeB2]);
  });
});

describe("escrita de mídia não atravessa o workspace", () => {
  it("removeMedia do A não remove a mídia do B", async () => {
    await expect(removeMedia(ctxA, midiaDeB1)).rejects.toBeInstanceOf(
      NotFoundError,
    );

    const intacta = await getMediaObject(ctxB, midiaDeB1, "full");
    expect(intacta.id).toBe(midiaDeB1);
  });

  it("setPlanCover do A não define a mídia do B como capa", async () => {
    await expect(
      setPlanCover(ctxA, planoDeB, midiaDeB2),
    ).rejects.toBeInstanceOf(NotFoundError);

    const plano = await getPlan(ctxB, planoDeB);
    expect(plano.coverMediaId).toBe(midiaDeB1);
  });

  it("setPlanCover do A com plano do A e mídia do B é recusado", async () => {
    await expect(
      setPlanCover(ctxA, PLANO_DO_SEED_A, midiaDeB2),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("clearPlanCover do A não limpa a capa do plano do B", async () => {
    await expect(clearPlanCover(ctxA, planoDeB)).rejects.toBeInstanceOf(
      NotFoundError,
    );

    const plano = await getPlan(ctxB, planoDeB);
    expect(plano.coverMediaId).toBe(midiaDeB1);
  });

  it("reorderPlanMedia do A não reordena a galeria do B", async () => {
    await expect(
      reorderPlanMedia(ctxA, planoDeB, [midiaDeB2, midiaDeB1]),
    ).rejects.toBeInstanceOf(ValidationError);

    const lista = await listPlanMedia(ctxB, planoDeB);
    expect(lista.map((f) => f.id)).toEqual([midiaDeB1, midiaDeB2]);
  });

  it("startUpload do A recusa assinar para o plano do B", async () => {
    await expect(
      startUpload(ctxA, {
        planId: planoDeB,
        purpose: "gallery",
        contentType: "image/webp",
        sizes: { full: 1000, thumb: 500 },
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("invariantes da capa", () => {
  it("existe no máximo um cover por plano", async () => {
    await setPlanCover(ctxB, planoDeB, midiaDeB2);

    const lista = await listPlanMedia(ctxB, planoDeB);
    const capas = lista.filter((f) => f.purpose === "cover");

    expect(capas).toHaveLength(1);
    expect(capas[0]!.id).toBe(midiaDeB2);

    const plano = await getPlan(ctxB, planoDeB);
    expect(plano.coverMediaId).toBe(midiaDeB2);
  });

  it("remover a capa deixa cover_media_id nulo, sem apagar o resto", async () => {
    await setPlanCover(ctxB, planoDeB, midiaDeB2);
    await removeMedia(ctxB, midiaDeB2);

    const plano = await getPlan(ctxB, planoDeB);
    expect(plano.coverMediaId).toBeNull();

    const lista = await listPlanMedia(ctxB, planoDeB);
    expect(lista.map((f) => f.id)).toEqual([midiaDeB1]);
  });

  it("reordenar recusa lista que não corresponde às fotos do plano", async () => {
    await expect(
      reorderPlanMedia(ctxB, planoDeB, [midiaDeB1, midiaDeB1]),
    ).rejects.toBeInstanceOf(ValidationError);

    await expect(
      reorderPlanMedia(ctxB, planoDeB, [crypto.randomUUID()]),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("a assinatura não deixa o caller escolher workspace nem chave", () => {
  it("as funções de mídia recebem contexto primeiro e só ids depois", () => {
    expect(listPlanMedia.length).toBe(2);
    expect(getMediaObject.length).toBe(3);
    expect(removeMedia.length).toBe(2);
    expect(setPlanCover.length).toBe(3);
    expect(reorderPlanMedia.length).toBe(3);
  });

  it("um workspaceId enfiado no input do startUpload é ignorado", async () => {
    const comLixo = {
      planId: planoDeB,
      purpose: "gallery",
      contentType: "image/webp",
      sizes: { full: 1000, thumb: 500 },
      workspaceId: WORKSPACE_B,
    } as Parameters<typeof startUpload>[1];

    // Continua sendo o plano do B visto pelo contexto do A: não encontrado.
    await expect(startUpload(ctxA, comLixo)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
