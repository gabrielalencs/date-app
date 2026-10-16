import "server-only";

import { and, eq, ne, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { media, plans } from "@/db/schema/index.ts";
import {
  MAX_VIDEO_DURATION_MS,
  MAX_VIDEO_SECONDS,
  OUTPUT_MIME,
  acceptsVideo,
  isAllowedForVariant,
  isAllowedUploadMime,
  isImageMime,
  isVideoMime,
  maxBytesFor,
  mediaKindOf,
  type MediaKind,
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
 *
 * Vídeo (D-184) passa pelos mesmos três. O que ele acrescenta é regra de
 * lugar: só entra com `purpose = 'memory'` — a Galeria — e nunca vira capa.
 * As duas regras são conferidas aqui, na assinatura **e** na confirmação, e
 * não só na tela: o frontend não é fonte de autoridade.
 */

const VIDEO_SO_NA_GALERIA =
  "Vídeo só entra pela Galeria, depois do rolê. A capa precisa ser uma foto.";

export type StartUploadInput = {
  planId: string;
  purpose: UploadablePurpose;
  /** MIME do `full`. Num vídeo, o `thumb` é sempre WebP: é o pôster. */
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
    throw new ValidationError("Tipo de arquivo não permitido.");
  }

  const kind = mediaKindOf(input.contentType);

  if (kind === "video" && !acceptsVideo(input.purpose)) {
    throw new ValidationError(VIDEO_SO_NA_GALERIA);
  }

  /* O pôster de um vídeo é o WebP que o aparelho sempre produz; o `thumb` de
     uma foto acompanha o tipo da foto, como sempre foi. */
  const thumbContentType = kind === "video" ? OUTPUT_MIME : input.contentType;

  for (const [variant, contentType] of [
    ["full", input.contentType],
    ["thumb", thumbContentType],
  ] as const) {
    const bytes = input.sizes[variant];
    if (
      !Number.isSafeInteger(bytes) ||
      bytes <= 0 ||
      bytes > maxBytesFor(variant, contentType)
    ) {
      throw new ValidationError(
        kind === "video"
          ? "Esse vídeo está acima do limite de envio."
          : "Essa imagem está acima do limite de envio.",
      );
    }
  }

  await assertPlanInWorkspace(ctx, input.planId);

  const uploadId = crypto.randomUUID();
  const keys = buildObjectKeys({
    workspaceId: ctx.workspaceId,
    planId: input.planId,
    mediaUuid: uploadId,
    kind,
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
      contentType: thumbContentType,
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
  /** Ausente é foto: é o que todo cliente anterior ao D-184 manda. */
  kind?: MediaKind;
  /** Obrigatória em vídeo, proibida em foto. */
  durationMs?: number;
};

/**
 * O par (tipo, duração) que a confirmação pode gravar. Recusa aqui, com
 * frase, o que o CHECK do banco recusaria com erro cru.
 */
function durationFor(input: ConfirmUploadInput): number | null {
  if (input.kind !== "video") {
    if (input.durationMs !== undefined) {
      throw new ValidationError("Foto não tem duração.");
    }
    return null;
  }

  const ms = input.durationMs;
  if (
    ms === undefined ||
    !Number.isSafeInteger(ms) ||
    ms <= 0 ||
    ms > MAX_VIDEO_DURATION_MS
  ) {
    throw new ValidationError(
      `O vídeo precisa ter até ${MAX_VIDEO_SECONDS} segundos.`,
    );
  }

  return ms;
}

export type MediaRow = typeof media.$inferSelect;

/**
 * Confirma no R2 e só então grava. Sem objeto no bucket, nenhuma linha nasce.
 */
export async function confirmUpload(
  ctx: AuthorizedContext,
  input: ConfirmUploadInput,
): Promise<MediaRow> {
  const kind = input.kind ?? "image";

  if (kind === "video" && !acceptsVideo(input.purpose)) {
    throw new ValidationError(VIDEO_SO_NA_GALERIA);
  }

  const durationMs = durationFor({ ...input, kind });

  await assertPlanInWorkspace(ctx, input.planId);

  /* A extensão da chave vem do tipo declarado. Um cliente que diga "vídeo"
     tendo subido foto procura `full.mp4`, não acha, e cai no NotFound abaixo
     — e o content-type que o R2 reporta é conferido logo depois de qualquer
     forma. */
  const keys = buildObjectKeys({
    workspaceId: ctx.workspaceId,
    planId: input.planId,
    mediaUuid: input.uploadId,
    kind,
  });

  const [fullFacts, thumbFacts] = await Promise.all([
    headObject(keys.full),
    headObject(keys.thumb),
  ]);

  if (!fullFacts || !thumbFacts) {
    throw new NotFoundError(
      kind === "video" ? "Vídeo enviado" : "Imagem enviada",
    );
  }

  /* O que vai para o banco é o que o R2 reporta. Se o cliente declarou 1 MB e
     subiu outra coisa, é este par que conta. O tipo também: um vídeo precisa
     ter chegado como `video/mp4`, uma foto como imagem, e o `thumb` dos dois
     como imagem. */
  const tipoConfere =
    kind === "video"
      ? isVideoMime(fullFacts.contentType)
      : isImageMime(fullFacts.contentType);

  if (
    !tipoConfere ||
    !isAllowedForVariant("thumb", thumbFacts.contentType) ||
    fullFacts.sizeBytes > maxBytesFor("full", fullFacts.contentType) ||
    thumbFacts.sizeBytes > maxBytesFor("thumb", thumbFacts.contentType)
  ) {
    // Objeto reprovado não vira linha; ele fica órfão e é faxina futura.
    await deleteObjects([keys.full, keys.thumb]);
    throw new ValidationError(
      kind === "video"
        ? "O vídeo enviado não passou na conferência."
        : "A imagem enviada não passou na conferência.",
    );
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
        durationMs,
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
      .select({ id: media.id, mimeType: media.mimeType })
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

    /* A capa é desenhada com `<img>` em cinco telas (D-184). A tela nem
       oferece a estrela num vídeo; esta é a recusa para quem chamar a action
       direto. */
    if (isVideoMime(foto.mimeType)) {
      throw new ValidationError("Vídeo não pode ser capa. Escolha uma foto.");
    }

    await promoteToCover(tx, ctx, planId, foto.id);
  });
}

/**
 * Reordena a galeria. Recebe a ordem inteira, não um par de índices: enviar a
 * lista fechada evita que uma reordenação concorrente componha duas trocas
 * parciais num estado que ninguém pediu.
 *
 * "A galeria" passou a excluir as fotos de memória (B9). Elas moram em outra
 * seção da página, na ordem em que foram tiradas, e não têm setas: o que se
 * fotografou depois do date é registro, não curadoria. Sem este recorte, a
 * lista fechada que a grade de fotos do plano envia nunca conferiria com o
 * total do plano, e reordenar passaria a falhar assim que a primeira foto de
 * memória existisse.
 *
 * Posição repetida entre as duas grades não incomoda: cada uma é lida com o
 * seu filtro de propósito, e `createdAt` desempata dentro de cada uma.
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
        and(
          eq(media.workspaceId, ctx.workspaceId),
          eq(media.planId, planId),
          ne(media.purpose, "memory"),
        ),
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

  // No máximo um `cover` por plano: a anterior volta a ser galeria.
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

  /* Foto de memória que vira capa **continua** sendo memória (B9).
     `plans.cover_media_id` é a autoridade sobre qual é a capa, e esta linha
     existe só para `purpose` registrar por onde a foto entrou. Sobrescrever
     `memory` com `cover` aqui tiraria a foto da grade de "Como foi?" no exato
     momento em que ela vira a capa — que é justamente o momento em que o card
     de `/memorias` deixa de mostrar a foto do site do restaurante e passa a
     mostrar a que as duas tiraram lá. */
  await tx
    .update(media)
    .set({ purpose: "cover" })
    .where(
      and(
        eq(media.workspaceId, ctx.workspaceId),
        eq(media.id, mediaId),
        ne(media.purpose, "memory"),
      ),
    );
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
