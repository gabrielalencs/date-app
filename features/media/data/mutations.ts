import "server-only";

import { and, eq, ne, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { media, plans } from "@/db/schema/index.ts";
import {
  MAX_BYTES,
  isAllowedUploadMime,
  type MediaVariant,
  type UploadablePurpose,
} from "@/features/media/constants";
import type { StartedUpload } from "@/features/media/contract";
import {
  deleteObjects,
  headObject,
  signUpload,
} from "@/features/media/r2/client";
import {
  assertKeyBelongsToWorkspace,
  buildObjectKeys,
} from "@/features/media/r2/object-key";
import type { AuthorizedContext } from "@/lib/auth/authorization-core";
import { NotFoundError, ValidationError } from "@/lib/errors";

/**
 * Escritas de mídia.
 *
 * Três invariantes, todos aqui e em nenhum outro lugar:
 *
 * 1. A object key é gerada neste módulo, a partir de `ctx.workspaceId`. Nenhuma
 *    função exportada aceita chave vinda de fora (seção 4 do docs/MEDIA_R2.md).
 * 2. A linha só nasce depois de `HeadObject` confirmar os dois objetos, e grava
 *    tamanho e content-type que o R2 reporta — nunca os que o cliente declarou
 *    (seção 5).
 * 3. Na remoção, a linha morre antes do objeto. Objeto órfão custa kilobytes;
 *    linha apontando para objeto inexistente é imagem quebrada (D-053).
 */

export type StartUploadInput = {
  planId: string;
  purpose: UploadablePurpose;
  contentType: string;
  /** Bytes medidos pelo browser. Entram na assinatura, não no banco. */
  sizes: Readonly<Record<MediaVariant, number>>;
};

/**
 * Confere o plano, sorteia a chave e assina os dois PUTs. Não escreve nada:
 * até a confirmação, este upload não existe para o produto.
 */
export async function startUpload(
  ctx: AuthorizedContext,
  input: StartUploadInput,
): Promise<StartedUpload> {
  if (!isAllowedUploadMime(input.contentType)) {
    throw new ValidationError("Tipo de imagem não permitido.");
  }

  for (const variant of ["full", "thumb"] as const) {
    const bytes = input.sizes[variant];
    if (
      !Number.isSafeInteger(bytes) ||
      bytes <= 0 ||
      bytes > MAX_BYTES[variant]
    ) {
      throw new ValidationError("Essa imagem está acima do limite de envio.");
    }
  }

  await assertPlanInWorkspace(ctx, input.planId);

  const uploadId = crypto.randomUUID();
  const keys = buildObjectKeys({
    workspaceId: ctx.workspaceId,
    planId: input.planId,
    mediaUuid: uploadId,
  });

  const [full, thumb] = await Promise.all([
    signUpload({
      objectKey: keys.full,
      variant: "full",
      contentType: input.contentType,
      contentLength: input.sizes.full,
    }),
    signUpload({
      objectKey: keys.thumb,
      variant: "thumb",
      contentType: input.contentType,
      contentLength: input.sizes.thumb,
    }),
  ]);

  return { uploadId, full, thumb };
}

export type ConfirmUploadInput = {
  planId: string;
  uploadId: string;
  purpose: UploadablePurpose;
  width: number;
  height: number;
};

export type MediaRow = typeof media.$inferSelect;

/**
 * Confirma no R2 e só então grava. Sem objeto no bucket, nenhuma linha nasce.
 */
export async function confirmUpload(
  ctx: AuthorizedContext,
  input: ConfirmUploadInput,
): Promise<MediaRow> {
  await assertPlanInWorkspace(ctx, input.planId);

  const keys = buildObjectKeys({
    workspaceId: ctx.workspaceId,
    planId: input.planId,
    mediaUuid: input.uploadId,
  });

  const [fullFacts, thumbFacts] = await Promise.all([
    headObject(keys.full),
    headObject(keys.thumb),
  ]);

  if (!fullFacts || !thumbFacts) {
    throw new NotFoundError("Imagem enviada");
  }

  /* O que vai para o banco é o que o R2 reporta. Se o cliente declarou 1 MB e
     subiu outra coisa, é este par que conta. */
  if (
    !isAllowedUploadMime(fullFacts.contentType) ||
    fullFacts.sizeBytes > MAX_BYTES.full ||
    thumbFacts.sizeBytes > MAX_BYTES.thumb
  ) {
    // Objeto reprovado não vira linha; ele fica órfão e é faxina futura.
    await deleteObjects([keys.full, keys.thumb]);
    throw new ValidationError("A imagem enviada não passou na conferência.");
  }

  return db.transaction(async (tx) => {
    const position = await nextPosition(tx, ctx, input.planId);

    const [row] = await tx
      .insert(media)
      .values({
        workspaceId: ctx.workspaceId,
        planId: input.planId,
        objectKey: keys.full,
        thumbObjectKey: keys.thumb,
        mimeType: fullFacts.contentType,
        sizeBytes: fullFacts.sizeBytes,
        width: input.width,
        height: input.height,
        purpose: input.purpose,
        position,
        uploadedBy: ctx.profileId,
      })
      .returning();

    if (!row) {
      throw new Error("Falha ao gravar a imagem.");
    }

    if (input.purpose === "cover") {
      await promoteToCover(tx, ctx, input.planId, row.id);
    }

    return row;
  });
}

/**
 * Remove. O cliente manda `mediaId`; nunca uma object key (seção 7).
 * A linha sai primeiro, o objeto depois.
 */
export async function removeMedia(
  ctx: AuthorizedContext,
  mediaId: string,
): Promise<{ orfaos: string[] }> {
  /* O DELETE devolve as chaves: o predicado de workspace vai dentro dele, e
     zero linhas é NotFoundError — nada de ler antes para depois apagar. A FK
     `plans.cover_media_id` é ON DELETE SET NULL, então a capa cai junto, na
     mesma instrução. */
  const [removida] = await db
    .delete(media)
    .where(and(eq(media.workspaceId, ctx.workspaceId), eq(media.id, mediaId)))
    .returning({
      objectKey: media.objectKey,
      thumbObjectKey: media.thumbObjectKey,
    });

  if (!removida) {
    throw new NotFoundError("Imagem");
  }

  const { orfaos } = await deleteObjects([
    assertKeyBelongsToWorkspace(removida.objectKey, ctx.workspaceId),
    assertKeyBelongsToWorkspace(removida.thumbObjectKey, ctx.workspaceId),
  ]);

  return { orfaos };
}

/**
 * Define a capa. `plans.cover_media_id` é a autoridade; `media.purpose` é
 * normalizado na mesma transação para os dois nunca discordarem.
 */
export async function setPlanCover(
  ctx: AuthorizedContext,
  planId: string,
  mediaId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [foto] = await tx
      .select({ id: media.id })
      .from(media)
      .where(
        and(
          eq(media.workspaceId, ctx.workspaceId),
          eq(media.id, mediaId),
          eq(media.planId, planId),
        ),
      )
      .limit(1);

    if (!foto) {
      throw new NotFoundError("Imagem");
    }

    await promoteToCover(tx, ctx, planId, foto.id);
  });
}

/** Tira a capa sem apagar a foto: ela volta a ser uma da galeria. */
export async function clearPlanCover(
  ctx: AuthorizedContext,
  planId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [plano] = await tx
      .update(plans)
      .set({ coverMediaId: null, updatedAt: new Date() })
      .where(and(eq(plans.workspaceId, ctx.workspaceId), eq(plans.id, planId)))
      .returning({ id: plans.id });

    if (!plano) {
      throw new NotFoundError("Plano");
    }

    await tx
      .update(media)
      .set({ purpose: "gallery" })
      .where(
        and(eq(media.workspaceId, ctx.workspaceId), eq(media.planId, planId)),
      );
  });
}

/**
 * Reordena a galeria. Recebe a ordem inteira, não um par de índices: enviar a
 * lista fechada evita que uma reordenação concorrente componha duas trocas
 * parciais num estado que ninguém pediu.
 */
export async function reorderPlanMedia(
  ctx: AuthorizedContext,
  planId: string,
  orderedMediaIds: readonly string[],
): Promise<void> {
  if (orderedMediaIds.length === 0) {
    return;
  }

  if (new Set(orderedMediaIds).size !== orderedMediaIds.length) {
    throw new ValidationError("A ordem enviada tem imagens repetidas.");
  }

  await db.transaction(async (tx) => {
    /* Trava as linhas do plano antes de escrever: leitura sem trava seguida de
       escrita é o padrão proibido; com FOR UPDATE dentro da transação não há
       janela (D-055). */
    const atuais = await tx
      .select({ id: media.id })
      .from(media)
      .where(
        and(eq(media.workspaceId, ctx.workspaceId), eq(media.planId, planId)),
      )
      .for("update");

    const conhecidos = new Set(atuais.map((linha) => linha.id));

    if (
      atuais.length !== orderedMediaIds.length ||
      orderedMediaIds.some((id) => !conhecidos.has(id))
    ) {
      throw new ValidationError(
        "A ordem enviada não corresponde às imagens deste plano.",
      );
    }

    for (const [posicao, id] of orderedMediaIds.entries()) {
      await tx
        .update(media)
        .set({ position: posicao })
        .where(
          and(
            eq(media.workspaceId, ctx.workspaceId),
            eq(media.planId, planId),
            eq(media.id, id),
          ),
        );
    }
  });
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function promoteToCover(
  tx: Tx,
  ctx: AuthorizedContext,
  planId: string,
  mediaId: string,
): Promise<void> {
  const [plano] = await tx
    .update(plans)
    .set({ coverMediaId: mediaId, updatedAt: new Date() })
    .where(and(eq(plans.workspaceId, ctx.workspaceId), eq(plans.id, planId)))
    .returning({ id: plans.id });

  if (!plano) {
    throw new NotFoundError("Plano");
  }

  // Exatamente um `cover` por plano: as outras voltam a ser galeria.
  await tx
    .update(media)
    .set({ purpose: "gallery" })
    .where(
      and(
        eq(media.workspaceId, ctx.workspaceId),
        eq(media.planId, planId),
        ne(media.id, mediaId),
        eq(media.purpose, "cover"),
      ),
    );

  await tx
    .update(media)
    .set({ purpose: "cover" })
    .where(and(eq(media.workspaceId, ctx.workspaceId), eq(media.id, mediaId)));
}

/**
 * Sem trava de propósito: duas confirmações simultâneas no mesmo plano podem
 * escolher a mesma posição, e o empate é resolvido por `createdAt` na ordenação
 * da galeria. Travar a tabela inteira do plano para decidir um número de
 * exibição custaria mais do que o defeito que evitaria, num produto de duas
 * pessoas. Reordenar, que é read-modify-write de verdade, usa FOR UPDATE.
 */
async function nextPosition(
  tx: Tx,
  ctx: AuthorizedContext,
  planId: string,
): Promise<number> {
  const [linha] = await tx
    .select({ proxima: sql<number>`coalesce(max(${media.position}) + 1, 0)` })
    .from(media)
    .where(
      and(eq(media.workspaceId, ctx.workspaceId), eq(media.planId, planId)),
    );

  return Number(linha?.proxima ?? 0);
}

async function assertPlanInWorkspace(
  ctx: AuthorizedContext,
  planId: string,
): Promise<void> {
  const [plano] = await db
    .select({ id: plans.id })
    .from(plans)
    .where(and(eq(plans.workspaceId, ctx.workspaceId), eq(plans.id, planId)))
    .limit(1);

  if (!plano) {
    throw new NotFoundError("Plano");
  }
}
