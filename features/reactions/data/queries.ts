import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import {
  profiles,
  reactions,
  workspaceMembers,
} from "@/db/schema/index.ts";
import {
  isOpinion,
  TOP_OPINION,
  type OpinionType,
  type ReactionType,
} from "@/features/reactions/constants";
import type { AuthorizedContext } from "@/lib/auth/authorization-core";

export type MemberReactions = {
  profileId: string;
  displayName: string;
  isCurrent: boolean;
  /** Favorito é pessoal; aparece só para quem é dono dele. */
  favorite: boolean;
  /** A opinião é exclusiva: uma ou nenhuma, nunca duas. */
  opinion: OpinionType | null;
};

export type PlanReactionSummary = {
  isFavorite: boolean;
  myOpinion: OpinionType | null;
  /** O topo da escala é visível para as duas pessoas, e só ele vai ao card. */
  lovedBy: readonly string[];
};

const EMPTY_SUMMARY: PlanReactionSummary = {
  isFavorite: false,
  myOpinion: null,
  lovedBy: [],
};

/** A opinião de uma pessoa num plano, ou nada. Uma linha, por construção. */
function opinionOf(
  rows: readonly { profileId: string; type: ReactionType }[],
  profileId: string,
): OpinionType | null {
  const row = rows.find(
    (candidate) => candidate.profileId === profileId && isOpinion(candidate.type),
  );
  return row ? (row.type as OpinionType) : null;
}

/** As duas pessoas e o que cada uma respondeu, sempre visíveis no detalhe. */
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
    opinion: opinionOf(rows, member.profileId),
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
    const isMine = row.profileId === ctx.profileId;

    summaries.set(row.planId, {
      isFavorite:
        current.isFavorite || (isMine && row.type === "favorite"),
      myOpinion:
        isMine && isOpinion(row.type)
          ? (row.type as OpinionType)
          : current.myOpinion,
      /* Só o topo vira marca no card. "Não curti" é uma resposta legítima e
         fica registrada no plano, mas transformá-la em etiqueta na grade
         faria a lista de ideias exibir um placar de rejeição. */
      lovedBy:
        row.type === TOP_OPINION
          ? [...current.lovedBy, isMine ? "Você" : row.displayName]
          : current.lovedBy,
    });
  }

  return summaries;
}
