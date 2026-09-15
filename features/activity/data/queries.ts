import "server-only";

import { and, count, desc, eq, or, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { activityEvents, profiles } from "@/db/schema/index.ts";
import type { AuthorizedContext } from "@/lib/auth/authorization-core";

export const ACTIVITY_PER_PAGE = 20;

export type ActivityVerb =
  | "plan_created"
  | "date_suggested"
  | "vote_cast"
  | "date_confirmed"
  | "booking_updated"
  | "plan_completed"
  | "memory_added"
  | "want_a_lot";

export type ActivityEntry = {
  id: string;
  actorProfileId: string;
  actorName: string;
  verb: ActivityVerb;
  subjectId: string;
  metadata: unknown;
  createdAt: Date;
};

export type ActivityPage = {
  entries: ActivityEntry[];
  page: number;
  total: number;
  totalPages: number;
};

/**
 * Feed do plano em duas consultas, independentemente de haver 10 ou 200
 * eventos: total colapsado e página colapsada. O fato mínimo no metadata torna
 * desnecessário consultar cada sujeito — inclusive depois de ele ser apagado.
 */
export async function listPlanActivity(
  ctx: AuthorizedContext,
  planId: string,
  requestedPage = 1,
): Promise<ActivityPage> {
  const belongsToPlan = or(
    and(
      eq(activityEvents.subjectType, "plan"),
      eq(activityEvents.subjectId, planId),
    ),
    and(
      eq(activityEvents.subjectType, "plan_date_option"),
      sql`${activityEvents.metadata} ->> 'planId' = ${planId}`,
    ),
  );

  const ranked = db
    .select({
      id: activityEvents.id,
      actorProfileId: activityEvents.actorProfileId,
      verb: activityEvents.verb,
      subjectId: activityEvents.subjectId,
      metadata: activityEvents.metadata,
      createdAt: activityEvents.createdAt,
      voteRank: sql<number>`case
        when ${activityEvents.verb} = 'vote_cast'
        then row_number() over (
          partition by ${activityEvents.actorProfileId}, ${activityEvents.subjectId}
          order by ${activityEvents.createdAt} desc, ${activityEvents.id} desc
        )
        else 1
      end`.as("vote_rank"),
    })
    .from(activityEvents)
    .where(and(eq(activityEvents.workspaceId, ctx.workspaceId), belongsToPlan))
    .as("ranked_activity");

  const [totalRow] = await db
    .select({ total: count() })
    .from(ranked)
    .where(eq(ranked.voteRank, 1));

  const total = Number(totalRow?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / ACTIVITY_PER_PAGE));
  const page = Math.min(Math.max(1, requestedPage), totalPages);

  const rows = await db
    .select({
      id: ranked.id,
      actorProfileId: ranked.actorProfileId,
      actorName: profiles.displayName,
      verb: ranked.verb,
      subjectId: ranked.subjectId,
      metadata: ranked.metadata,
      createdAt: ranked.createdAt,
    })
    .from(ranked)
    .innerJoin(profiles, eq(profiles.id, ranked.actorProfileId))
    .where(eq(ranked.voteRank, 1))
    .orderBy(desc(ranked.createdAt), desc(ranked.id))
    .limit(ACTIVITY_PER_PAGE)
    .offset((page - 1) * ACTIVITY_PER_PAGE);

  return { entries: rows, page, total, totalPages };
}
