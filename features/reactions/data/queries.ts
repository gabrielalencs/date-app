import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import {
  profiles,
  reactions,
  workspaceMembers,
} from "@/db/schema/index.ts";
import type { AuthorizedContext } from "@/lib/auth/authorization-core";

export type MemberReactions = {
  profileId: string;
  displayName: string;
  isCurrent: boolean;
  favorite: boolean;
  wantALot: boolean;
};

export type PlanReactionSummary = {
  isFavorite: boolean;
  isWantedByMe: boolean;
  wantALotBy: readonly string[];
};

const EMPTY_SUMMARY: PlanReactionSummary = {
  isFavorite: false,
  isWantedByMe: false,
  wantALotBy: [],
};

/** As duas pessoas e os dois tipos, sempre visíveis no detalhe. */
export async function listPlanReactions(
  ctx: AuthorizedContext,
  planId: string,
): Promise<MemberReactions[]> {
  const [members, rows] = await Promise.all([
    db
      .select({
        profileId: profiles.id,
        displayName: profiles.displayName,
      })
      .from(workspaceMembers)
      .innerJoin(profiles, eq(profiles.id, workspaceMembers.profileId))
      .where(eq(workspaceMembers.workspaceId, ctx.workspaceId))
      .orderBy(asc(workspaceMembers.createdAt), asc(profiles.id)),
    db
      .select({ profileId: reactions.profileId, type: reactions.type })
      .from(reactions)
      .where(
        and(
          eq(reactions.workspaceId, ctx.workspaceId),
          eq(reactions.planId, planId),
        ),
      ),
  ]);

  return members.map((member) => ({
    ...member,
    isCurrent: member.profileId === ctx.profileId,
    favorite: rows.some(
      (row) => row.profileId === member.profileId && row.type === "favorite",
    ),
    wantALot: rows.some(
      (row) => row.profileId === member.profileId && row.type === "want_a_lot",
    ),
  }));
}

/**
 * Uma leitura em bloco para todos os cards. Nenhuma consulta nasce dentro do
 * map: vinte planos continuam custando uma consulta de reações.
 */
export async function listPlanReactionSummaries(
  ctx: AuthorizedContext,
  planIds: readonly string[],
): Promise<Map<string, PlanReactionSummary>> {
  if (planIds.length === 0) return new Map();

  const rows = await db
    .select({
      planId: reactions.planId,
      profileId: reactions.profileId,
      type: reactions.type,
      displayName: profiles.displayName,
    })
    .from(reactions)
    .innerJoin(profiles, eq(profiles.id, reactions.profileId))
    .where(
      and(
        eq(reactions.workspaceId, ctx.workspaceId),
        inArray(reactions.planId, [...planIds]),
      ),
    )
    .orderBy(asc(profiles.displayName));

  const summaries = new Map<string, PlanReactionSummary>();

  for (const row of rows) {
    const current = summaries.get(row.planId) ?? EMPTY_SUMMARY;
    summaries.set(row.planId, {
      isFavorite:
        current.isFavorite ||
        (row.profileId === ctx.profileId && row.type === "favorite"),
      isWantedByMe:
        current.isWantedByMe ||
        (row.profileId === ctx.profileId && row.type === "want_a_lot"),
      wantALotBy:
        row.type === "want_a_lot"
          ? [
              ...current.wantALotBy,
              row.profileId === ctx.profileId ? "Você" : row.displayName,
            ]
          : current.wantALotBy,
    });
  }

  return summaries;
}
