"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  archivePlan,
  changePlanStatus,
  createPlan,
  unarchivePlan,
  updatePlan,
} from "@/features/plans/data/mutations";
import { requireAuthorizedContext } from "@/lib/auth/authorization";
import { CATEGORIES } from "@/lib/categories";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { optionalCentsFromText } from "@/lib/money";
import { InvalidTransitionError } from "@/lib/plan-status";
import { PLAN_STATUSES } from "@/lib/status";

export type ActionState = { error?: string };

const EMPTY: ActionState = {};

/** Campo de texto opcional: string vazia do formulário vira null. */
const optionalText = z
  .string()
  .trim()
  .max(2000)
  .transform((value) => (value.length === 0 ? null : value))
  .nullable();

const createSchema = z.object({
  title: z.string().trim().min(1, "O título é obrigatório.").max(200),
  category: z.enum(CATEGORIES),
  sourceUrl: z
    .string()
    .trim()
    .max(2000)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .refine(
      (value) => value === null || z.url().safeParse(value).success,
      "O link precisa ser uma URL válida.",
    ),
});

const updateSchema = z.object({
  title: z.string().trim().min(1, "O título é obrigatório.").max(200),
  category: z.enum(CATEGORIES),
  description: optionalText,
  priority: z.coerce.number().int().min(0).max(3),
  placeName: optionalText,
  city: optionalText,
  state: optionalText,
  notes: optionalText,
  estimatedBudgetCents: optionalCentsFromText,
  requiresBooking: z
    .union([z.literal("on"), z.literal("")])
    .optional()
    .transform((value) => value === "on"),
});

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Confira os campos e tente de novo.";
}

function text(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

export async function createPlanAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireAuthorizedContext();

  const parsed = createSchema.safeParse({
    title: text(formData, "title"),
    category: text(formData, "category"),
    sourceUrl: text(formData, "sourceUrl"),
  });

  if (!parsed.success) {
    return { error: firstIssue(parsed.error) };
  }

  const plan = await createPlan(ctx, parsed.data);

  revalidatePath("/ideias");
  revalidatePath("/");
  redirect(`/planos/${plan.id}`);
}

export async function updatePlanAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireAuthorizedContext();
  const planId = text(formData, "planId");

  const parsed = updateSchema.safeParse({
    title: text(formData, "title"),
    category: text(formData, "category"),
    description: text(formData, "description"),
    priority: text(formData, "priority"),
    placeName: text(formData, "placeName"),
    city: text(formData, "city"),
    state: text(formData, "state"),
    notes: text(formData, "notes"),
    estimatedBudgetCents: text(formData, "estimatedBudgetCents"),
    requiresBooking: text(formData, "requiresBooking") === "on" ? "on" : "",
  });

  if (!parsed.success) {
    return { error: firstIssue(parsed.error) };
  }

  try {
    await updatePlan(ctx, planId, parsed.data);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return { error: "Esse plano não existe." };
    }
    if (error instanceof ValidationError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath(`/planos/${planId}`);
  revalidatePath("/ideias");
  revalidatePath("/");
  return EMPTY;
}

const statusSchema = z.enum(PLAN_STATUSES);

export async function changeStatusAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireAuthorizedContext();
  const planId = text(formData, "planId");
  const parsed = statusSchema.safeParse(text(formData, "status"));

  if (!parsed.success) {
    return { error: "Status inválido." };
  }

  try {
    await changePlanStatus(ctx, planId, parsed.data);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return { error: "Esse plano não existe." };
    }
    if (error instanceof InvalidTransitionError) {
      return { error: "Esse plano não pode ir para esse status agora." };
    }
    if (error instanceof ValidationError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath(`/planos/${planId}`);
  revalidatePath("/ideias");
  revalidatePath("/");
  return EMPTY;
}

export async function archivePlanAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireAuthorizedContext();
  const planId = text(formData, "planId");
  const desarquivar = text(formData, "unarchive") === "on";

  try {
    if (desarquivar) {
      await unarchivePlan(ctx, planId);
    } else {
      await archivePlan(ctx, planId);
    }
  } catch (error) {
    if (error instanceof NotFoundError) {
      return { error: "Esse plano não existe." };
    }
    throw error;
  }

  revalidatePath(`/planos/${planId}`);
  revalidatePath("/ideias");
  revalidatePath("/");
  return EMPTY;
}
