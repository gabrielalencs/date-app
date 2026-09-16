import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { media } from "@/db/schema/index.ts";
import type { MediaVariant } from "@/features/media/constants";
import { assertKeyBelongsToWorkspace } from "@/features/media/r2/object-key";
import type { AuthorizedContext } from "@/lib/auth/authorization-core";
import { NotFoundError } from "@/lib/errors";

/**
 * Leituras de mídia. Contexto em primeiro lugar, `workspaceId` nunca é
 * parâmetro, todo `where` começa pelo predicado de workspace (docs/DATA_ACCESS.md
 * seção 3, D-037).
 *
 * Nenhuma função aqui aceita object key. O cliente conhece `mediaId` e nada
 * mais; a chave é lida da linha e conferida contra o workspace do contexto
 * antes de virar chamada ao R2.
 */
export type MediaRow = typeof media.$inferSelect;

export type PlanPhoto = {
  id: string;
  purpose: MediaRow["purpose"];
  position: number;
  width: number | null;
  height: number | null;
  createdAt: Date;
};

const PHOTO_COLUMNS = {
  id: media.id,
  purpose: media.purpose,
  position: media.position,
  width: media.width,
  height: media.height,
  createdAt: media.createdAt,
} as const;

/** Galeria e capa de um plano, na ordem de exibição. */
export async function listPlanMedia(
  ctx: AuthorizedContext,
  planId: string,
): Promise<PlanPhoto[]> {
  return db
    .select(PHOTO_COLUMNS)
    .from(media)
    .where(
      and(eq(media.workspaceId, ctx.workspaceId), eq(media.planId, planId)),
    )
    .orderBy(asc(media.position), asc(media.createdAt));
}

export type MediaObject = {
  id: string;
  objectKey: string;
  mimeType: string;
  sizeBytes: number;
};

/**
 * Resolve a chave de uma variante para a rota de leitura. Linha de outro
 * workspace é `NotFoundError`, igual a id inexistente (D-038).
 */
export async function getMediaObject(
  ctx: AuthorizedContext,
  mediaId: string,
  variant: MediaVariant,
): Promise<MediaObject> {
  const [row] = await db
    .select({
      id: media.id,
      objectKey: media.objectKey,
      thumbObjectKey: media.thumbObjectKey,
      mimeType: media.mimeType,
      sizeBytes: media.sizeBytes,
    })
    .from(media)
    .where(and(eq(media.workspaceId, ctx.workspaceId), eq(media.id, mediaId)))
    .limit(1);

  if (!row) {
    throw new NotFoundError("Imagem");
  }

  const objectKey = variant === "thumb" ? row.thumbObjectKey : row.objectKey;

  return {
    id: row.id,
    // Cinto e suspensório: a chave já veio de uma linha escopada.
    objectKey: assertKeyBelongsToWorkspace(objectKey, ctx.workspaceId),
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
  };
}

/**
 * Qual foto é a capa é decidido por `plans.cover_media_id`, não por
 * `media.purpose` — daí a lista de capas sair da consulta de planos, em
 * `features/plans/data/queries.ts`, e não daqui. O `purpose` registra por onde
 * a foto entrou e é mantido em sincronia por `setPlanCover`, que roda em
 * transação; ninguém lê `purpose` para descobrir a capa.
 */
