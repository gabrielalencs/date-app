"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  ALLOWED_UPLOAD_MIME,
  MAX_BYTES,
  UPLOADABLE_PURPOSES,
} from "@/features/media/constants";
import type { MediaResult, StartedUpload } from "@/features/media/contract";
import {
  confirmUpload,
  removeMedia,
  reorderPlanMedia,
  setPlanCover,
  startUpload,
} from "@/features/media/data/mutations";
import { requireAuthorizedContext } from "@/lib/auth/authorization";
import { NotFoundError, ValidationError } from "@/lib/errors";

/**
 * Boundary de entrada da mídia. Tudo que chega do browser passa por Zod aqui
 * e por nada mais — a camada de dados assume entrada já tipada.
 *
 * Nenhuma action aceita object key. O cliente conhece `planId`, `mediaId` e o
 * `uploadId` que o servidor devolveu, e é só isso que ele consegue dizer.
 *
 * Estas actions recebem objeto, não `FormData`: o fluxo de upload é conduzido
 * por JavaScript de ponta a ponta (D-056), então não há formulário a preservar.
 */
const uuid = z.uuid();

const startSchema = z.object({
  planId: uuid,
  purpose: z.enum(UPLOADABLE_PURPOSES),
  contentType: z.enum(ALLOWED_UPLOAD_MIME),
  sizes: z.object({
    full: z.number().int().positive().max(MAX_BYTES.full),
    thumb: z.number().int().positive().max(MAX_BYTES.thumb),
  }),
});

const confirmSchema = z.object({
  planId: uuid,
  uploadId: uuid,
  purpose: z.enum(UPLOADABLE_PURPOSES),
  width: z.number().int().positive().max(20_000),
  height: z.number().int().positive().max(20_000),
});

const removeSchema = z.object({ planId: uuid, mediaId: uuid });
const coverSchema = z.object({ planId: uuid, mediaId: uuid });
const reorderSchema = z.object({
  planId: uuid,
  orderedMediaIds: z.array(uuid).min(1).max(60),
});

/** Erro de domínio vira frase; o resto sobe e vira 500, como deve. */
function toMessage(error: unknown): string {
  if (error instanceof NotFoundError) {
    return "Essa imagem não existe mais.";
  }
  if (error instanceof ValidationError) {
    return error.message;
  }
  throw error;
}

function invalid(): { ok: false; error: string } {
  return {
    ok: false,
    error: "Não deu para enviar essa imagem. Tente de novo.",
  };
}

function revalidatePlan(planId: string): void {
  revalidatePath(`/planos/${planId}`);
  revalidatePath("/ideias");
  revalidatePath("/");
}

export async function startUploadAction(
  input: unknown,
): Promise<MediaResult<StartedUpload>> {
  const ctx = await requireAuthorizedContext();
  const parsed = startSchema.safeParse(input);

  if (!parsed.success) {
    return invalid();
  }

  try {
    return { ok: true, data: await startUpload(ctx, parsed.data) };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

export async function confirmUploadAction(
  input: unknown,
): Promise<MediaResult<{ mediaId: string }>> {
  const ctx = await requireAuthorizedContext();
  const parsed = confirmSchema.safeParse(input);

  if (!parsed.success) {
    return invalid();
  }

  try {
    const row = await confirmUpload(ctx, parsed.data);
    revalidatePlan(parsed.data.planId);
    return { ok: true, data: { mediaId: row.id } };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

export async function removeMediaAction(
  input: unknown,
): Promise<MediaResult<undefined>> {
  const ctx = await requireAuthorizedContext();
  const parsed = removeSchema.safeParse(input);

  if (!parsed.success) {
    return invalid();
  }

  try {
    await removeMedia(ctx, parsed.data.mediaId);
    revalidatePlan(parsed.data.planId);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

export async function setCoverAction(
  input: unknown,
): Promise<MediaResult<undefined>> {
  const ctx = await requireAuthorizedContext();
  const parsed = coverSchema.safeParse(input);

  if (!parsed.success) {
    return invalid();
  }

  try {
    await setPlanCover(ctx, parsed.data.planId, parsed.data.mediaId);
    revalidatePlan(parsed.data.planId);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

export async function reorderMediaAction(
  input: unknown,
): Promise<MediaResult<undefined>> {
  const ctx = await requireAuthorizedContext();
  const parsed = reorderSchema.safeParse(input);

  if (!parsed.success) {
    return invalid();
  }

  try {
    await reorderPlanMedia(
      ctx,
      parsed.data.planId,
      parsed.data.orderedMediaIds,
    );
    revalidatePlan(parsed.data.planId);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}
