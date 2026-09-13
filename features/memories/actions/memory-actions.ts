"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  MAX_HIGHLIGHT_LENGTH,
  MAX_NOTES_LENGTH,
} from "@/features/memories/constants";
import {
  clearMemoryRating,
  saveMemoryText,
  setMemoryRating,
  setMemoryRepeat,
} from "@/features/memories/data/mutations";
import { requireAuthorizedContext } from "@/lib/auth/authorization";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { MAX_RATING, MIN_RATING, REPEAT_ANSWERS } from "@/lib/rating";

/**
 * Boundary de entrada das memórias. Tudo que chega do formulário passa por Zod
 * aqui e por nada mais; a camada de dados assume entrada já tipada.
 *
 * O banco garante a faixa da nota por CHECK desde o B2 e o Zod a explica — o
 * contraste de sempre (D-065): o banco impede o estado impossível, a aplicação
 * escreve a frase que a pessoa lê.
 */
export type ActionState = { error?: string };

const EMPTY: ActionState = {};

const uuid = z.uuid();

function text(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

function toMessage(error: unknown): string {
  if (error instanceof NotFoundError) {
    return "Esse plano não existe mais.";
  }
  if (error instanceof ValidationError) {
    return error.message;
  }
  throw error;
}

/** A memória muda a timeline e o card do plano, e nada mais. */
function revalidateMemory(planId: string): void {
  revalidatePath(`/planos/${planId}`);
  revalidatePath("/memorias");
}

/** Vazio é retirar; qualquer outra coisa é uma das cinco notas. */
const ratingSchema = z.object({
  planId: uuid,
  rating: z.union([
    z.literal(""),
    z.coerce.number().int().min(MIN_RATING).max(MAX_RATING),
  ]),
});

export async function rateMemoryAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireAuthorizedContext();

  const parsed = ratingSchema.safeParse({
    planId: text(formData, "planId"),
    rating: text(formData, "rating"),
  });

  if (!parsed.success) {
    return { error: `A nota vai de ${MIN_RATING} a ${MAX_RATING}.` };
  }

  const { planId, rating } = parsed.data;

  try {
    /* Vazio chega quando a pessoa reenvia a nota que já tinha — o controle não
       tem "desmarcar", e retirar devolve aquela pessoa a "ainda não avaliou",
       que é estado distinto de nota baixa (seção 4). */
    if (rating === "") {
      await clearMemoryRating(ctx, planId);
    } else {
      await setMemoryRating(ctx, planId, rating as 1 | 2 | 3 | 4 | 5);
    }
  } catch (error) {
    return { error: toMessage(error) };
  }

  revalidateMemory(planId);
  return EMPTY;
}

const repeatSchema = z.object({
  planId: uuid,
  repeat: z.union([z.literal(""), z.enum(REPEAT_ANSWERS)]),
});

export async function setRepeatAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireAuthorizedContext();

  const parsed = repeatSchema.safeParse({
    planId: text(formData, "planId"),
    repeat: text(formData, "repeat"),
  });

  if (!parsed.success) {
    return { error: "Resposta inválida." };
  }

  const { planId, repeat } = parsed.data;

  try {
    await setMemoryRepeat(ctx, planId, repeat === "" ? null : repeat);
  } catch (error) {
    return { error: toMessage(error) };
  }

  revalidateMemory(planId);
  return EMPTY;
}

/** Campo de texto opcional: string vazia do formulário vira null. */
function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable();
}

const textSchema = z.object({
  planId: uuid,
  highlight: optionalText(MAX_HIGHLIGHT_LENGTH),
  notes: optionalText(MAX_NOTES_LENGTH),
});

export async function saveMemoryTextAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireAuthorizedContext();

  const parsed = textSchema.safeParse({
    planId: text(formData, "planId"),
    highlight: text(formData, "highlight"),
    notes: text(formData, "notes"),
  });

  if (!parsed.success) {
    return {
      error: `A melhor parte cabe em ${MAX_HIGHLIGHT_LENGTH} caracteres, e as observações em ${MAX_NOTES_LENGTH}.`,
    };
  }

  const { planId, highlight, notes } = parsed.data;

  try {
    await saveMemoryText(ctx, planId, { highlight, notes });
  } catch (error) {
    return { error: toMessage(error) };
  }

  revalidateMemory(planId);
  return EMPTY;
}
