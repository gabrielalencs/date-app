"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  addChecklistItem,
  addExpense,
  deleteChecklistItem,
  deleteExpense,
  moveChecklistItem,
  saveReservationDetails,
  setReservationStatus,
  toggleChecklistItem,
} from "@/features/planning/data/mutations";
import { requireAuthorizedContext } from "@/lib/auth/authorization";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { centsFromText } from "@/lib/money";

/**
 * Server Actions de reserva, checklist e gastos.
 *
 * Zod no boundary, mensagens escritas por gente, `revalidatePath` nas rotas
 * afetadas. Nenhuma delas recebe `workspaceId`: o contexto sai de
 * `requireAuthorizedContext`, e o frontend nunca é fonte de autoridade.
 */
export type ActionState = { error?: string; ok?: boolean };

const EMPTY: ActionState = {};

function text(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Confira os campos e tente de novo.";
}

/** Toda action deste módulo trata os mesmos três erros de domínio. */
function toState(error: unknown): ActionState {
  if (error instanceof NotFoundError) {
    return { error: "Isso não existe mais. Recarregue a página." };
  }

  if (error instanceof ValidationError) {
    return { error: error.message };
  }

  throw error;
}

function revalidatePlan(planId: string): void {
  revalidatePath(`/planos/${planId}`);
  revalidatePath("/ideias");
  revalidatePath("/agenda");
  revalidatePath("/");
}

/* ------------------------------------------------------------------ *
 * Reserva
 * ------------------------------------------------------------------ */

const optionalText = z
  .string()
  .trim()
  .max(2000)
  .transform((value) => (value.length === 0 ? null : value))
  .nullable();

const reservationSchema = z.object({
  code: z
    .string()
    .trim()
    .max(120)
    .transform((v) => (v === "" ? null : v)),
  /** `HH:mm` do `<input type="time">`; vazio vira null. */
  reservedTime: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .refine(
      (value) => value === null || /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value),
      "Escreva o horário como 20:30.",
    ),
  url: optionalText.refine(
    (value) => value === null || z.url().safeParse(value).success,
    "O link precisa ser uma URL válida.",
  ),
  notes: optionalText,
});

export async function saveReservationAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireAuthorizedContext();
  const planId = text(formData, "planId");

  const parsed = reservationSchema.safeParse({
    code: text(formData, "code"),
    reservedTime: text(formData, "reservedTime"),
    url: text(formData, "url"),
    notes: text(formData, "notes"),
  });

  if (!parsed.success) {
    return { error: firstIssue(parsed.error) };
  }

  try {
    await saveReservationDetails(ctx, planId, parsed.data);
  } catch (error) {
    return toState(error);
  }

  revalidatePlan(planId);
  return { ok: true };
}

const reservationStatusSchema = z.enum(["pending", "confirmed", "cancelled"]);

export async function setReservationStatusAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireAuthorizedContext();
  const planId = text(formData, "planId");
  const parsed = reservationStatusSchema.safeParse(text(formData, "status"));

  if (!parsed.success) {
    return { error: "Estado de reserva inválido." };
  }

  try {
    await setReservationStatus(ctx, planId, parsed.data);
  } catch (error) {
    return toState(error);
  }

  revalidatePlan(planId);
  return { ok: true };
}

/* ------------------------------------------------------------------ *
 * Checklist
 * ------------------------------------------------------------------ */

const labelSchema = z
  .string()
  .trim()
  .min(1, "Escreva o que precisa ser lembrado.")
  .max(200, "O item ficou longo demais.");

export async function addChecklistItemAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireAuthorizedContext();
  const planId = text(formData, "planId");
  const parsed = labelSchema.safeParse(text(formData, "label"));

  if (!parsed.success) {
    return { error: firstIssue(parsed.error) };
  }

  try {
    await addChecklistItem(ctx, planId, parsed.data);
  } catch (error) {
    return toState(error);
  }

  revalidatePlan(planId);
  return { ok: true };
}

export async function toggleChecklistItemAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireAuthorizedContext();
  const planId = text(formData, "planId");
  const itemId = text(formData, "itemId");
  const done = text(formData, "done") === "on";

  try {
    await toggleChecklistItem(ctx, itemId, done);
  } catch (error) {
    return toState(error);
  }

  revalidatePlan(planId);
  return { ok: true };
}

export async function deleteChecklistItemAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireAuthorizedContext();
  const planId = text(formData, "planId");

  try {
    await deleteChecklistItem(ctx, text(formData, "itemId"));
  } catch (error) {
    return toState(error);
  }

  revalidatePlan(planId);
  return { ok: true };
}

export async function moveChecklistItemAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireAuthorizedContext();
  const planId = text(formData, "planId");
  const parsed = z.enum(["up", "down"]).safeParse(text(formData, "direction"));

  if (!parsed.success) {
    return { error: "Direção inválida." };
  }

  try {
    await moveChecklistItem(ctx, text(formData, "itemId"), parsed.data);
  } catch (error) {
    return toState(error);
  }

  revalidatePlan(planId);
  return EMPTY;
}

/* ------------------------------------------------------------------ *
 * Gastos
 * ------------------------------------------------------------------ */

const expenseSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, "Escreva no que foi o gasto.")
    .max(200, "A descrição ficou longa demais."),
  /* O teto e o formato são recusados aqui, nunca pelo banco: erro de driver não
     tem como ser explicado a quem digitou. */
  amountCents: centsFromText,
  paidBy: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .nullable(),
});

export async function addExpenseAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireAuthorizedContext();
  const planId = text(formData, "planId");

  const parsed = expenseSchema.safeParse({
    label: text(formData, "label"),
    amountCents: text(formData, "amountCents"),
    paidBy: text(formData, "paidBy"),
  });

  if (!parsed.success) {
    return { error: firstIssue(parsed.error) };
  }

  try {
    await addExpense(ctx, planId, parsed.data);
  } catch (error) {
    return toState(error);
  }

  revalidatePlan(planId);
  return { ok: true };
}

export async function deleteExpenseAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireAuthorizedContext();
  const planId = text(formData, "planId");

  try {
    await deleteExpense(ctx, text(formData, "expenseId"));
  } catch (error) {
    return toState(error);
  }

  revalidatePlan(planId);
  return { ok: true };
}
