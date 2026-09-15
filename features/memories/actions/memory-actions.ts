"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  MAX_HIGHLIGHT_LENGTH,
  MAX_NOTES_LENGTH,
} from "@/features/memories/constants";
import {
  clearMemoryRating,
  rateMemory,
  saveMemoryNotes,
  setWouldRepeat,
} from "@/features/memories/data/mutations";
import { changePlanStatus } from "@/features/plans/data/mutations";
import { requireAuthorizedContext } from "@/lib/auth/authorization";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { InvalidTransitionError } from "@/lib/plan-status";
import {
  isRatingValue,
  isRepeatAnswer,
  type RatingValue,
  type RepeatAnswer,
} from "@/lib/rating";

/**
 * Server Actions do B9. Zod no boundary, mensagens escritas por gente,
 * `revalidatePath` nas rotas afetadas.
 *
 * Nenhuma recebe `workspaceId` nem `profileId`: o contexto sai de
 * `requireAuthorizedContext`, e o frontend nunca é fonte de autoridade. Em
 * particular, ninguém avalia pelo outro — a camada de dados escreve sempre em
 * `ctx.profileId`, e não há campo de formulário que diga quem está avaliando.
 */
export type ActionState = { error?: string; ok?: boolean };

function text(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Confira os campos e tente de novo.";
}

function toState(error: unknown): ActionState {
  if (error instanceof NotFoundError) {
    return { error: "Isso não existe mais. Recarregue a página." };
  }

  if (error instanceof ValidationError) {
    return { error: error.message };
  }

  /* A máquina de status recusando é erro de domínio, não defeito: acontece
     quando a página ficou aberta e o plano mudou de estado em outra aba. */
  if (error instanceof InvalidTransitionError) {
    return {
      error: "Esse plano não está mais nesse estado. Recarregue a página.",
    };
  }

  throw error;
}

function revalidatePlan(planId: string): void {
  revalidatePath(`/planos/${planId}`);
  revalidatePath("/memorias");
  revalidatePath("/ideias");
  revalidatePath("/agenda");
  revalidatePath("/");
}

/* ------------------------------------------------------------------ *
 * A travessia
 * ------------------------------------------------------------------ */

/**
 * Marca o date como realizado.
 *
 * Não existe mutation própria: isto é `changePlanStatus`, o mesmo caminho de
 * toda mudança de status desde o B4 — transação, `FOR UPDATE` no plano,
 * máquina de status, pré-condições consultadas dentro da transação e evento
 * `plan_completed` na mesma escrita.
 *
 * A confirmação em modal fica na interface. Ela não é a garantia: o servidor
 * recusa de novo, porque um POST forjado não passa por modal nenhum.
 */
export async function completePlanAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireAuthorizedContext();
  const planId = text(formData, "planId");

  try {
    await changePlanStatus(ctx, planId, "completed");
  } catch (error) {
    return toState(error);
  }

  revalidatePlan(planId);
  return { ok: true };
}

/* ------------------------------------------------------------------ *
 * Avaliação
 * ------------------------------------------------------------------ */

/**
 * Vazio significa "retirar".
 *
 * O controle de nota manda `""` quando a pessoa clica na nota que já tinha,
 * exatamente como o controle de voto do B6 — reenviar a mesma resposta a
 * retira, e o controle não precisa de um botão "desmarcar" ao lado.
 */
const ratingSchema = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : Number(value)))
  /* Predicado de tipo, e não `as`: o guarda que a escala já exporta estreita a
     saída do schema, e o `sem any` do CLAUDE.md vale para o cast também. */
  .refine(
    (value): value is RatingValue | null =>
      value === null || isRatingValue(value),
    "Escolha uma nota de 1 a 5.",
  );

export async function rateMemoryAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireAuthorizedContext();
  const planId = text(formData, "planId");
  const parsed = ratingSchema.safeParse(text(formData, "rating"));

  if (!parsed.success) {
    return { error: firstIssue(parsed.error) };
  }

  try {
    if (parsed.data === null) {
      await clearMemoryRating(ctx, planId);
    } else {
      await rateMemory(ctx, planId, parsed.data);
    }
  } catch (error) {
    return toState(error);
  }

  revalidatePlan(planId);
  return { ok: true };
}

const repeatSchema = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .refine(
    (value): value is RepeatAnswer | null =>
      value === null || isRepeatAnswer(value),
    "Resposta inválida.",
  );

export async function setWouldRepeatAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireAuthorizedContext();
  const planId = text(formData, "planId");
  const parsed = repeatSchema.safeParse(text(formData, "wouldRepeat"));

  if (!parsed.success) {
    return { error: firstIssue(parsed.error) };
  }

  try {
    await setWouldRepeat(ctx, planId, parsed.data);
  } catch (error) {
    return toState(error);
  }

  revalidatePlan(planId);
  return { ok: true };
}

const notesSchema = z.object({
  highlight: z
    .string()
    .trim()
    .max(MAX_HIGHLIGHT_LENGTH, "A melhor parte ficou longa demais.")
    .transform((value) => (value === "" ? null : value)),
  notes: z
    .string()
    .trim()
    .max(MAX_NOTES_LENGTH, "As observações ficaram longas demais.")
    .transform((value) => (value === "" ? null : value)),
});

export async function saveMemoryNotesAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireAuthorizedContext();
  const planId = text(formData, "planId");

  const parsed = notesSchema.safeParse({
    highlight: text(formData, "highlight"),
    notes: text(formData, "notes"),
  });

  if (!parsed.success) {
    return { error: firstIssue(parsed.error) };
  }

  try {
    await saveMemoryNotes(ctx, planId, parsed.data);
  } catch (error) {
    return toState(error);
  }

  revalidatePlan(planId);
  return { ok: true };
}
