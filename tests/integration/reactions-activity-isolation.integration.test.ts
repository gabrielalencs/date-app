import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, count, eq, sql } from "drizzle-orm";

import { closeDatabasePool, db } from "@/db/client";
import { countQueries } from "@/db/query-counter";
import * as schema from "@/db/schema/index.ts";
import { listPlanActivity } from "@/features/activity/data/queries";
import { activityText } from "@/features/activity/presentation";
import {
  castVote,
  confirmDateOption,
  createDateOption,
  deleteDateOption,
  unconfirmDateOption,
} from "@/features/dates/data/mutations";
import { listPlans } from "@/features/plans/data/queries";
import { toggleReaction } from "@/features/reactions/data/mutations";
import {
  listPlanReactionSummaries,
  listPlanReactions,
} from "@/features/reactions/data/queries";
import type { AuthorizedContext } from "@/lib/auth/authorization-core";
import { NotFoundError } from "@/lib/errors";

const WORKSPACE_A = "ba100000-0000-4000-8000-000000000001";
const WORKSPACE_B = "ba100000-0000-4000-8000-000000000002";
const PLAN_A = "ba100000-0000-4000-8000-000000000011";
const PLAN_B = "ba100000-0000-4000-8000-000000000012";
const SCALE_PLAN = "ba100000-0000-4000-8000-000000000013";
const PROFILE_A = "b10_profile_a";
const PROFILE_A2 = "b10_profile_a2";
const PROFILE_B = "b10_profile_b";

const ctxA: AuthorizedContext = {
  userId: PROFILE_A,
  profileId: PROFILE_A,
  workspaceId: WORKSPACE_A,
  role: "owner",
};
const ctxA2: AuthorizedContext = {
  userId: PROFILE_A2,
  profileId: PROFILE_A2,
  workspaceId: WORKSPACE_A,
  role: "member",
};
const ctxB: AuthorizedContext = {
  userId: PROFILE_B,
  profileId: PROFILE_B,
  workspaceId: WORKSPACE_B,
  role: "owner",
};

async function eventCount(workspaceId: string): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(schema.activityEvents)
    .where(eq(schema.activityEvents.workspaceId, workspaceId));
  return Number(row?.total ?? 0);
}

beforeAll(async () => {
  if (process.env.NEON_BRANCH !== "development") {
    throw new Error("B10 integration tests only run on development.");
  }

  await db.insert(schema.profiles).values([
    { id: PROFILE_A, displayName: "Pessoa A" },
    { id: PROFILE_A2, displayName: "Pessoa A2" },
    { id: PROFILE_B, displayName: "Pessoa B" },
  ]);
  await db.insert(schema.workspaces).values([
    { id: WORKSPACE_A, name: "B10 A" },
    { id: WORKSPACE_B, name: "B10 B" },
  ]);
  await db.insert(schema.workspaceMembers).values([
    { workspaceId: WORKSPACE_A, profileId: PROFILE_A, role: "owner" },
    { workspaceId: WORKSPACE_A, profileId: PROFILE_A2, role: "member" },
    { workspaceId: WORKSPACE_B, profileId: PROFILE_B, role: "owner" },
  ]);
  await db.insert(schema.plans).values([
    {
      id: PLAN_A,
      workspaceId: WORKSPACE_A,
      createdBy: PROFILE_A,
      title: "Plano A do B10",
      category: "gastronomia",
      city: "São Paulo",
      estimatedBudgetCents: 12000,
    },
    {
      id: SCALE_PLAN,
      workspaceId: WORKSPACE_A,
      createdBy: PROFILE_A,
      title: "Escala do feed B10",
      category: "cultura",
    },
    {
      id: PLAN_B,
      workspaceId: WORKSPACE_B,
      createdBy: PROFILE_B,
      title: "Plano B do B10",
      category: "viagem",
    },
  ]);
});

afterAll(async () => {
  await db
    .delete(schema.workspaces)
    .where(sql`${schema.workspaces.id} in (${WORKSPACE_A}, ${WORKSPACE_B})`);
  await db
    .delete(schema.profiles)
    .where(sql`${schema.profiles.id} in (${PROFILE_A}, ${PROFILE_A2}, ${PROFILE_B})`);
  await closeDatabasePool();
});

describe("reações por pessoa e isolamento", () => {
  it("favorito é pessoal e silencioso; quero muito é compartilhado e emite", async () => {
    const before = await eventCount(WORKSPACE_A);
    expect(await toggleReaction(ctxA, PLAN_A, "favorite")).toEqual({ active: true });
    expect(await eventCount(WORKSPACE_A)).toBe(before);

    const favoritesA = await listPlans(ctxA, { favoritesOnly: true });
    const favoritesA2 = await listPlans(ctxA2, { favoritesOnly: true });
    expect(favoritesA.map((plan) => plan.id)).toContain(PLAN_A);
    expect(favoritesA2.map((plan) => plan.id)).not.toContain(PLAN_A);

    expect(await toggleReaction(ctxA, PLAN_A, "want_a_lot")).toEqual({ active: true });
    expect(await eventCount(WORKSPACE_A)).toBe(before + 1);

    const seenByOther = await listPlanReactions(ctxA2, PLAN_A);
    expect(seenByOther.find((member) => member.profileId === PROFILE_A)).toMatchObject({
      favorite: true,
      opinion: "want_a_lot",
    });
    const badges = await listPlanReactionSummaries(ctxA2, [PLAN_A]);
    expect(badges.get(PLAN_A)?.lovedBy).toEqual(["Pessoa A"]);
  });


  it("reagir novamente retira sem apagar o evento histórico", async () => {
    const before = await eventCount(WORKSPACE_A);
    expect(await toggleReaction(ctxA, PLAN_A, "want_a_lot")).toEqual({ active: false });
    expect(await eventCount(WORKSPACE_A)).toBe(before);
    expect(await toggleReaction(ctxA, PLAN_A, "want_a_lot")).toEqual({ active: true });
    expect(await eventCount(WORKSPACE_A)).toBe(before + 1);
  });

  it("A não cria reação no plano de B e não lê o feed de B", async () => {
    await expect(toggleReaction(ctxA, PLAN_B, "favorite")).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect((await listPlanActivity(ctxA, PLAN_B)).entries).toEqual([]);

    await toggleReaction(ctxB, PLAN_B, "want_a_lot");
    const summariesA = await listPlanReactionSummaries(ctxA, [PLAN_B]);
    expect(summariesA.get(PLAN_B)).toBeUndefined();
    expect((await listPlanActivity(ctxA, PLAN_B)).entries).toEqual([]);
  });

  it("o unique recusa duplicata mesmo burlando a camada de dados", async () => {
    await expect(
      db.insert(schema.reactions).values({
        workspaceId: WORKSPACE_A,
        planId: PLAN_A,
        profileId: PROFILE_A,
        type: "favorite",
      }),
    ).rejects.toThrow();
  });
});

describe("fato mínimo e degradação", () => {
  it("os três eventos de data novos carregam startsAt", async () => {
    const startsAt = new Date("2027-06-14T23:30:00.000Z");
    const option = await createDateOption(ctxA, PLAN_A, {
      startsAt,
      allDay: false,
    });
    await castVote(ctxA, option.id, "yes");
    await confirmDateOption(ctxA, option.id);

    const rows = await db
      .select({ verb: schema.activityEvents.verb, metadata: schema.activityEvents.metadata })
      .from(schema.activityEvents)
      .where(eq(schema.activityEvents.subjectId, option.id));

    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.metadata).toMatchObject({ startsAt: startsAt.toISOString() });
    }

    await unconfirmDateOption(ctxA, PLAN_A);
    await deleteDateOption(ctxA, option.id);

    const feed = await listPlanActivity(ctxA, PLAN_A);
    const suggestion = feed.entries.find(
      (entry) => entry.verb === "date_suggested" && entry.subjectId === option.id,
    );
    expect(suggestion).toBeDefined();
    expect(activityText(suggestion!, new Date("2027-06-15T12:00:00Z"))).not.toBe(
      "sugeriu uma data",
    );
  });

  it("evento antigo sem startsAt continua legível depois do sujeito sumir", async () => {
    const missingOption = randomUUID();
    await db.insert(schema.activityEvents).values({
      workspaceId: WORKSPACE_A,
      actorProfileId: PROFILE_A2,
      verb: "date_suggested",
      subjectType: "plan_date_option",
      subjectId: missingOption,
      metadata: { planId: PLAN_A, optionId: missingOption, allDay: false },
    });

    const feed = await listPlanActivity(ctxA, PLAN_A);
    const old = feed.entries.find((entry) => entry.subjectId === missingOption);
    expect(old).toBeDefined();
    expect(activityText(old!, new Date())).toBe("sugeriu uma data");
  });
});

describe("colapso e escala do feed", () => {
  it("cinco mudanças de voto ficam no banco e viram uma linha", async () => {
    const optionId = randomUUID();
    const values = ["yes", "maybe", "no", "maybe", "yes"] as const;
    await db.insert(schema.activityEvents).values(
      values.map((vote, index) => ({
        workspaceId: WORKSPACE_A,
        actorProfileId: PROFILE_A2,
        verb: "vote_cast" as const,
        subjectType: "plan_date_option",
        subjectId: optionId,
        metadata: {
          planId: PLAN_A,
          optionId,
          vote,
          startsAt: "2027-07-01T22:00:00.000Z",
        },
        createdAt: new Date(`2027-06-01T12:0${index}:00.000Z`),
      })),
    );

    const [raw] = await db
      .select({ total: count() })
      .from(schema.activityEvents)
      .where(
        and(
          eq(schema.activityEvents.workspaceId, WORKSPACE_A),
          eq(schema.activityEvents.subjectId, optionId),
        ),
      );
    expect(Number(raw?.total ?? 0)).toBe(5);

    const feed = await listPlanActivity(ctxA, PLAN_A);
    expect(feed.entries.filter((entry) => entry.subjectId === optionId)).toHaveLength(1);
  });

  it("mantém a mesma contagem de consultas com dez e duzentos eventos", async () => {
    const makeEvents = (start: number, amount: number) =>
      Array.from({ length: amount }, (_, offset) => ({
        workspaceId: WORKSPACE_A,
        actorProfileId: PROFILE_A,
        verb: "plan_created" as const,
        subjectType: "plan",
        subjectId: SCALE_PLAN,
        metadata: { sequence: start + offset },
      }));

    await db.insert(schema.activityEvents).values(makeEvents(0, 10));
    const ten = await countQueries(() => listPlanActivity(ctxA, SCALE_PLAN));
    expect(ten.result.total).toBe(10);

    await db.insert(schema.activityEvents).values(makeEvents(10, 190));
    const twoHundred = await countQueries(() =>
      listPlanActivity(ctxA, SCALE_PLAN),
    );
    expect(twoHundred.result.total).toBe(200);
    expect(twoHundred.queries).toBe(ten.queries);
    expect(twoHundred.queries).toBe(2);
  });
  it("a opinião é exclusiva e não arrasta o favorito junto", async () => {
    /* Plano próprio, para não depender do estado que os testes acima
       deixam no PLAN_A nem o alterar para os de baixo. */
    const planId = randomUUID();
    await db.insert(schema.plans).values({
      id: planId,
      workspaceId: WORKSPACE_A,
      title: "Opinião exclusiva",
      category: "gastronomia",
      createdBy: PROFILE_A,
    });

    await toggleReaction(ctxA, planId, "favorite");
    await toggleReaction(ctxA, planId, "want_a_lot");

    // Trocar de ideia é uma opinião, não duas.
    expect(await toggleReaction(ctxA, planId, "pass")).toEqual({ active: true });

    const linhas = await db
      .select({ type: schema.reactions.type })
      .from(schema.reactions)
      .where(
        and(
          eq(schema.reactions.workspaceId, WORKSPACE_A),
          eq(schema.reactions.planId, planId),
          eq(schema.reactions.profileId, PROFILE_A),
        ),
      );

    expect(linhas.map((linha) => linha.type).sort()).toEqual([
      "favorite",
      "pass",
    ]);

    const membros = await listPlanReactions(ctxA, planId);
    expect(membros.find((member) => member.profileId === PROFILE_A)).toMatchObject({
      favorite: true,
      opinion: "pass",
    });

    /* "Não curti" não vira marca no card: só o topo da escala vai para a
       grade, e um placar de rejeição em /ideias seria outro produto. */
    const badges = await listPlanReactionSummaries(ctxA, [planId]);
    expect(badges.get(planId)?.lovedBy).toEqual([]);
    expect(badges.get(planId)?.myOpinion).toBe("pass");

    // Responder a mesma coisa de novo retira, como o voto.
    expect(await toggleReaction(ctxA, planId, "pass")).toEqual({ active: false });
    const vazio = await listPlanReactions(ctxA, planId);
    expect(vazio.find((member) => member.profileId === PROFILE_A)?.opinion).toBeNull();

    await db.delete(schema.plans).where(eq(schema.plans.id, planId));
  });
});
