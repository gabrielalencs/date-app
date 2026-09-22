import "server-only";

import { and, eq, ne } from "drizzle-orm";

import { db } from "@/db/client";
import { activityEvents, plans, reactions } from "@/db/schema/index.ts";
import { enqueuePartnerIntent } from "@/features/notifications/data/outbox";
import { startNotificationWorkflows } from "@/features/notifications/workflow/start";
import {
  isOpinion,
  TOP_OPINION,
  type ReactionType,
} from "@/features/reactions/constants";
import type { AuthorizedContext } from "@/lib/auth/authorization-core";
import { NotFoundError } from "@/lib/errors";

/**
 * Reagir de novo retira. A trava no plano serializa dois cliques concorrentes
 * antes do select/delete/insert e deixa o unique do banco como última garantia.
 *
 * Favorito e opinião passam pela mesma porta, mas não pela mesma regra: o
 * favorito é sozinho no eixo dele e só liga e desliga, enquanto uma opinião
 * **substitui** a anterior. Trocar "Curti" por "Não curti" é uma mudança de
 * ideia, não duas reações — e é por isso que o delete abaixo apaga as irmãs
 * dentro da mesma transação que insere a nova. O índice único parcial do B2+R2
 * é a garantia final, para o caso de dois toques escaparem da trava.
 */
export async function toggleReaction(
  ctx: AuthorizedContext,
  planId: string,
  type: ReactionType,
): Promise<{ active: boolean }> {
  const { active, intents } = await db.transaction(async (tx) => {
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
      /* Retirar não notifica e não cancela a intent: a revalidação é que decide.
         Se a retirada acontecer antes dos 5 minutos, `shouldSend` encontra a
         reação ausente e suprime — a prova está no teste de stale state. */
      return { active: false, intents: [] as string[] };
    }

    /* Uma opinião por pessoa por plano. Sem isto, responder "Curti" depois de
       "Amei" deixaria as duas gravadas e a tela teria de escolher qual contar —
       e o feed já teria avisado a outra pessoa de um entusiasmo revogado. */
    if (isOpinion(type)) {
      await tx.delete(reactions).where(
        and(
          eq(reactions.workspaceId, ctx.workspaceId),
          eq(reactions.planId, planId),
          eq(reactions.profileId, ctx.profileId),
          ne(reactions.type, "favorite"),
        ),
      );
    }

    await tx.insert(reactions).values({
      workspaceId: ctx.workspaceId,
      planId,
      profileId: ctx.profileId,
      type,
    });

    /* Favorito é organização pessoal e fica em silêncio. O topo da escala é a
       mensagem para a outra pessoa e emite apenas quando entra, não ao sair —
       e "Curti", "Tanto faz" e "Não curti" são resposta, não chamado. */
    if (type === TOP_OPINION) {
      await tx.insert(activityEvents).values({
        workspaceId: ctx.workspaceId,
        actorProfileId: ctx.profileId,
        verb: "want_a_lot",
        subjectType: "plan",
        subjectId: planId,
      });
    }

    const intents =
      type === TOP_OPINION
        ? await enqueuePartnerIntent(tx, ctx, {
            kind: "want_a_lot",
            planId,
            now: new Date(),
          })
        : /* Favorito é organização pessoal: silencioso no feed desde o B10 e
             silencioso no push agora, pela mesma razão. */
          [];

    return { active: true, intents };
  });

  await startNotificationWorkflows(intents);

  return { active };
}
