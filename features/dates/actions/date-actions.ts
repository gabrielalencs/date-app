"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  castVote,
  clearVote,
  confirmDateOption,
  createDateOption,
  deleteDateOption,
  unconfirmDateOption,
} from "@/features/dates/data/mutations";
import { requireAuthorizedContext } from "@/lib/auth/authorization";
import { VOTE_VALUES } from "@/lib/consensus";
import { InvalidDateInputError, parseDateInput } from "@/lib/datetime";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { InvalidTransitionError } from "@/lib/plan-status";

/**
 * Boundary de entrada das datas. Zod aqui e em nenhum outro lugar; a camada de
 * dados assume entrada já tipada.
 *
 * A data chega como `yyyy-MM-dd` e `HH:mm` do formulário e vira instante em
 * `lib/datetime.ts`, que é o único módulo autorizado a interpretar isso
 * (D-059). Nada aqui monta `Date` a partir de string por conta própria.
 */
export type ActionState = {
  error?: string;
  /** Sinaliza sucesso para a interface fechar o formulário. */
  ok?: boolean;
};

const EMPTY: ActionState = {};

function text(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

function toMessage(error: unknown): string {
  if (error instanceof NotFoundError) return "Essa data não existe mais.";
  if (error instanceof InvalidDateInputError) return error.message;
  if (error instanceof ValidationError) return error.message;
  if (error instanceof InvalidTransitionError) {
    return "O plano não pode mudar de status agora.";
  }
  throw error;
}

function revalidatePlan(planId: string): void {
  revalidatePath(`/planos/${planId}`);
  revalidatePath("/ideias");
  revalidatePath("/");
}

const uuid = z.uuid();

const createSchema = z.object({
  planId: uuid,
  date: z.string().trim().min(1, "Escolha um dia."),
  time: z.string().trim(),
  allDay: z.boolean(),
  note: z
    .string()
    .trim()
    .max(280, "A observação ficou longa demais.")
    .transform((value) => (value.length === 0 ? null : value)),
});

export async function createDateOptionAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireAuthorizedContext();

  const parsed = createSchema.safeParse({
    planId: text(formData, "planId"),
    date: text(formData, "date"),
    time: text(formData, "time"),
    allDay: text(formData, "allDay") === "on",
    note: text(formData, "note"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Confira os campos." };
  }

  const { planId, date, time, allDay, note } = parsed.data;

  try {
    /* Dia inteiro ignora o horário de propósito: se a pessoa marcou o
       alternador, o que ela quer é o dia, não as 00:00 de um instante. */
    const startsAt = parseDateInput(date, allDay ? null : time);

    await createDateOption(ctx, planId, { startsAt, allDay, note });
  } catch (error) {
    return { error: toMessage(error) };
  }

  revalidatePlan(planId);
  return { ok: true };
}

const voteSchema = z.object({
  planId: uuid,
  optionId: uuid,
  vote: z.union([z.enum(VOTE_VALUES), z.literal("")]),
});

export async function castVoteAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireAuthorizedContext();

  const parsed = voteSchema.safeParse({
    planId: text(formData, "planId"),
    optionId: text(formData, "optionId"),
    vote: text(formData, "vote"),
  });

  if (!parsed.success) {
    return { error: "Voto inválido." };
  }

  const { planId, optionId, vote } = parsed.data;

  try {
    // Vazio é retirar o voto: volta a "ainda não respondeu" (seção 4).
    if (vote === "") {
      await clearVote(ctx, optionId);
    } else {
      await castVote(ctx, optionId, vote);
    }
  } catch (error) {
    return { error: toMessage(error) };
  }

  revalidatePlan(planId);
  return EMPTY;
}

const optionSchema = z.object({ planId: uuid, optionId: uuid });

export async function deleteDateOptionAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireAuthorizedContext();

  const parsed = optionSchema.safeParse({
    planId: text(formData, "planId"),
    optionId: text(formData, "optionId"),
  });

  if (!parsed.success) {
    return { error: "Data inválida." };
  }

  try {
    await deleteDateOption(ctx, parsed.data.optionId);
  } catch (error) {
    return { error: toMessage(error) };
  }

  revalidatePlan(parsed.data.planId);
  return EMPTY;
}

export async function confirmDateOptionAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireAuthorizedContext();

  const parsed = optionSchema.safeParse({
    planId: text(formData, "planId"),
    optionId: text(formData, "optionId"),
  });

  if (!parsed.success) {
    return { error: "Data inválida." };
  }

  try {
    await confirmDateOption(ctx, parsed.data.optionId);
  } catch (error) {
    return { error: toMessage(error) };
  }

  revalidatePlan(parsed.data.planId);
  return EMPTY;
}

const planSchema = z.object({ planId: uuid });

export async function unconfirmDateAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireAuthorizedContext();

  const parsed = planSchema.safeParse({ planId: text(formData, "planId") });

  if (!parsed.success) {
    return { error: "Plano inválido." };
  }

  try {
    await unconfirmDateOption(ctx, parsed.data.planId);
  } catch (error) {
    return { error: toMessage(error) };
  }

  revalidatePlan(parsed.data.planId);
  return EMPTY;
}
