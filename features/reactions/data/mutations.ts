import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { activityEvents, plans, reactions } from "@/db/schema/index.ts";
import type { ReactionType } from "@/features/reactions/constants";
import type { AuthorizedContext } from "@/lib/auth/authorization-core";
import { NotFoundError } from "@/lib/errors";

/**
 * Reagir de novo retira. A trava no plano serializa dois cliques concorrentes
 * antes do select/delete/insert e deixa o unique do banco como última garantia.
 */
export async function toggleReaction(
  ctx: AuthorizedContext,
  planId: string,
  type: ReactionType,
): Promise<{ active: boolean }> {
  return db.transaction(async (tx) => {
    const [plan] = await tx
      .select({ id: plans.id })
      .from(plans)
      .where(and(eq(plans.workspaceId, ctx.workspaceId), eq(plans.id, planId)))
      .for("update")
      .limit(1);

    if (!plan) {
      throw new NotFoundError("Plano");
    }

    const predicate = and(
      eq(reactions.workspaceId, ctx.workspaceId),
      eq(reactions.planId, planId),
      eq(reactions.profileId, ctx.profileId),
      eq(reactions.type, type),
    );

    const [existing] = await tx
      .select({ id: reactions.id })
      .from(reactions)
      .where(predicate)
      .limit(1);

    if (existing) {
      await tx.delete(reactions).where(predicate);
      return { active: false };
    }

    await tx.insert(reactions).values({
      workspaceId: ctx.workspaceId,
      planId,
      profileId: ctx.profileId,
      type,
    });

    /* Favorito é organização pessoal e fica em silêncio. "Quero muito" é a
       mensagem para a outra pessoa e emite apenas quando entra, não ao sair. */
    if (type === "want_a_lot") {
      await tx.insert(activityEvents).values({
        workspaceId: ctx.workspaceId,
        actorProfileId: ctx.profileId,
        verb: "want_a_lot",
        subjectType: "plan",
        subjectId: planId,
      });
    }

    return { active: true };
  });
}
