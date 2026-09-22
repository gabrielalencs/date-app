"use server";

import { randomInt } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  isRandomizableStatus,
  parseDiscoveryFilters,
} from "@/features/discovery/filters";
import { REACTION_TYPES } from "@/features/reactions/constants";
import { toggleReaction } from "@/features/reactions/data/mutations";
import { listPlans } from "@/features/plans/data/queries";
import { requireAuthorizedContext } from "@/lib/auth/authorization";
import { NotFoundError } from "@/lib/errors";

export type ReactionActionState = { error?: string };
export type RandomizerActionState = { message?: string };

const reactionSchema = z.object({
  planId: z.uuid(),
  type: z.enum(REACTION_TYPES),
});

const randomizerSchema = z.object({
  status: z.string().max(32),
  category: z.string().max(64),
  sort: z.string().max(32),
  maxBudget: z.string().max(64),
  favorites: z.string().max(1),
});

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function toggleReactionAction(
  _previous: ReactionActionState,
  formData: FormData,
): Promise<ReactionActionState> {
  const ctx = await requireAuthorizedContext();
  const parsed = reactionSchema.safeParse({
    planId: text(formData, "planId"),
    type: text(formData, "type"),
  });

  if (!parsed.success) return { error: "Essa reação não é válida." };

  try {
    await toggleReaction(ctx, parsed.data.planId, parsed.data.type);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return { error: "Esse plano não existe mais." };
    }
    throw error;
  }

  revalidatePath(`/planos/${parsed.data.planId}`);
  revalidatePath("/ideias");
  revalidatePath("/");
  return {};
}

/** Sorteio acontece uma vez na ação; a URL de destino estabiliza o resultado. */
export async function choosePlanAction(
  _previous: RandomizerActionState,
  formData: FormData,
): Promise<RandomizerActionState> {
  const ctx = await requireAuthorizedContext();
  const parsed = randomizerSchema.safeParse({
    status: text(formData, "status"),
    category: text(formData, "category"),
    sort: text(formData, "sort"),
    maxBudget: text(formData, "maxBudget"),
    favorites: text(formData, "favorites"),
  });

  if (!parsed.success) {
    return { message: "Não deu para ler esses filtros. Tente aplicá-los de novo." };
  }

  const filters = parseDiscoveryFilters(parsed.data);
  if (!isRandomizableStatus(filters.status)) {
    return {
      message: "O sorteio usa apenas ideias que ainda podem acontecer.",
    };
  }

  const candidates = await listPlans(ctx, { ...filters, limit: 200 });
  if (candidates.length === 0) {
    return {
      message:
        "Nenhuma ideia combina com esses filtros. Afrouxe um deles e tente de novo.",
    };
  }

  const chosen = candidates[randomInt(candidates.length)];
  if (!chosen) {
    return { message: "Nenhuma ideia está disponível para sortear." };
  }

  redirect(`/planos/${chosen.id}`);
}
