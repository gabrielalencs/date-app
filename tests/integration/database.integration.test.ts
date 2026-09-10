import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@/db/schema/index.ts";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const PROFILE_IDS = ["seed_profile_alex", "seed_profile_nina"] as const;
const DECIDING_PLAN_ID = "22222222-0000-4000-8000-000000000003";
const RESERVED_PLAN_ID = "22222222-0000-4000-8000-000000000006";
const COMPLETED_PLAN_ID = "22222222-0000-4000-8000-000000000007";
const MISSING_PLAN_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const EXPECTED_PLAN_IDS = Array.from(
  { length: 8 },
  (_, index) =>
    `22222222-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
);

type DatabaseModule = typeof import("@/db/client.ts");
type Database = DatabaseModule["db"];

let databaseModule: DatabaseModule | undefined;
let database: Database;

function requiredUrl(name: "DATABASE_URL" | "DATABASE_URL_UNPOOLED"): URL {
  const raw = process.env[name];
  if (!raw) {
    throw new Error(`${name} não está definida em .env.local.`);
  }

  const url = new URL(raw);
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error(`${name} não é uma URL PostgreSQL.`);
  }
  return url;
}

function requireDevelopmentDatabase(): void {
  if (process.env.NEON_BRANCH !== "development") {
    throw new Error("ABORTADO: test:db exige NEON_BRANCH=development.");
  }

  const pooled = requiredUrl("DATABASE_URL");
  const direct = requiredUrl("DATABASE_URL_UNPOOLED");
  const normalizedPooledHost = pooled.hostname.replace(/-pooler(?=\.)/, "");

  if (
    normalizedPooledHost !== direct.hostname ||
    !pooled.hostname.includes("-pooler.") ||
    direct.hostname.includes("-pooler.") ||
    pooled.pathname !== direct.pathname
  ) {
    throw new Error(
      "ABORTADO: URLs pooled/unpooled não apontam para o mesmo banco development.",
    );
  }
}

function postgresErrorCode(error: unknown, depth = 0): string | undefined {
  if (depth > 3 || typeof error !== "object" || error === null) {
    return undefined;
  }

  const code = Reflect.get(error, "code");
  if (typeof code === "string") return code;

  return postgresErrorCode(Reflect.get(error, "cause"), depth + 1);
}

beforeAll(async () => {
  requireDevelopmentDatabase();
  databaseModule = await import("@/db/client.ts");
  database = databaseModule.db;
});

afterAll(async () => {
  await databaseModule?.closeDatabasePool();
});

describe("banco Neon development semeado", () => {
  it("encontra o workspace, os dois profiles e ambas as memberships", async () => {
    const workspace = await database
      .select({ id: schema.workspaces.id })
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, WORKSPACE_ID));
    const profiles = await database
      .select({ id: schema.profiles.id })
      .from(schema.profiles)
      .where(inArray(schema.profiles.id, [...PROFILE_IDS]));
    const members = await database
      .select({
        workspaceId: schema.workspaceMembers.workspaceId,
        profileId: schema.workspaceMembers.profileId,
      })
      .from(schema.workspaceMembers)
      .innerJoin(
        schema.profiles,
        eq(schema.workspaceMembers.profileId, schema.profiles.id),
      )
      .where(eq(schema.workspaceMembers.workspaceId, WORKSPACE_ID));

    expect(workspace).toEqual([{ id: WORKSPACE_ID }]);
    expect(profiles.map(({ id }) => id).sort()).toEqual(
      [...PROFILE_IDS].sort(),
    );
    expect(members).toHaveLength(2);
    expect(members.map(({ profileId }) => profileId).sort()).toEqual(
      [...PROFILE_IDS].sort(),
    );
    expect(
      members.every(({ workspaceId }) => workspaceId === WORKSPACE_ID),
    ).toBe(true);
  });

  it("mantém exatamente oito plans no workspace e cobre os seis status", async () => {
    const plans = await database
      .select({
        id: schema.plans.id,
        workspaceId: schema.plans.workspaceId,
        status: schema.plans.status,
      })
      .from(schema.plans)
      .where(eq(schema.plans.workspaceId, WORKSPACE_ID));

    expect(plans.map(({ id }) => id).sort()).toEqual(EXPECTED_PLAN_IDS);
    expect(plans.every(({ workspaceId }) => workspaceId === WORKSPACE_ID)).toBe(
      true,
    );
    expect(new Set(plans.map(({ status }) => status))).toEqual(
      new Set([
        "idea",
        "deciding",
        "planned",
        "reserved",
        "completed",
        "cancelled",
      ]),
    );
  });

  it("relaciona várias opções e votos divergentes ao plano em decisão", async () => {
    const options = await database
      .select({ id: schema.planDateOptions.id })
      .from(schema.planDateOptions)
      .where(
        and(
          eq(schema.planDateOptions.workspaceId, WORKSPACE_ID),
          eq(schema.planDateOptions.planId, DECIDING_PLAN_ID),
        ),
      );
    const optionIds = options.map(({ id }) => id);
    const votes = await database
      .select({
        optionId: schema.planDateVotes.optionId,
        profileId: schema.planDateVotes.profileId,
        vote: schema.planDateVotes.vote,
      })
      .from(schema.planDateVotes)
      .innerJoin(
        schema.profiles,
        eq(schema.planDateVotes.profileId, schema.profiles.id),
      )
      .where(inArray(schema.planDateVotes.optionId, optionIds));

    const votesByOption = new Map<string, Set<string>>();
    for (const vote of votes) {
      const values = votesByOption.get(vote.optionId) ?? new Set<string>();
      values.add(vote.vote);
      votesByOption.set(vote.optionId, values);
    }

    expect(options).toHaveLength(3);
    expect(votes).toHaveLength(4);
    expect(new Set(votes.map(({ profileId }) => profileId))).toEqual(
      new Set(PROFILE_IDS),
    );
    expect([...votesByOption.values()].some((values) => values.size > 1)).toBe(
      true,
    );
  });

  it("liga checklist e expenses aos plans esperados", async () => {
    const checklist = await database
      .select({ planId: schema.checklistItems.planId })
      .from(schema.checklistItems)
      .innerJoin(
        schema.plans,
        eq(schema.checklistItems.planId, schema.plans.id),
      )
      .where(eq(schema.checklistItems.workspaceId, WORKSPACE_ID));
    const expenses = await database
      .select({ planId: schema.expenses.planId })
      .from(schema.expenses)
      .innerJoin(schema.plans, eq(schema.expenses.planId, schema.plans.id))
      .where(eq(schema.expenses.workspaceId, WORKSPACE_ID));

    expect(checklist).toHaveLength(3);
    expect(checklist.every(({ planId }) => planId === RESERVED_PLAN_ID)).toBe(
      true,
    );
    expect(expenses).toHaveLength(2);
    expect(expenses.every(({ planId }) => planId === COMPLETED_PLAN_ID)).toBe(
      true,
    );
  });

  it("liga reactions aos profiles/plans e a memória concluída às avaliações", async () => {
    const reactions = await database
      .select({
        planId: schema.reactions.planId,
        profileId: schema.reactions.profileId,
      })
      .from(schema.reactions)
      .innerJoin(schema.plans, eq(schema.reactions.planId, schema.plans.id))
      .innerJoin(
        schema.profiles,
        eq(schema.reactions.profileId, schema.profiles.id),
      )
      .where(eq(schema.reactions.workspaceId, WORKSPACE_ID));
    const memories = await database
      .select({ id: schema.memories.id, status: schema.plans.status })
      .from(schema.memories)
      .innerJoin(schema.plans, eq(schema.memories.planId, schema.plans.id))
      .where(eq(schema.memories.workspaceId, WORKSPACE_ID));
    const ratings = await database
      .select({
        memoryId: schema.memoryRatings.memoryId,
        profileId: schema.memoryRatings.profileId,
      })
      .from(schema.memoryRatings)
      .innerJoin(
        schema.profiles,
        eq(schema.memoryRatings.profileId, schema.profiles.id),
      )
      .where(eq(schema.memoryRatings.workspaceId, WORKSPACE_ID));

    expect(reactions).toHaveLength(3);
    expect(
      reactions.every(({ planId }) => EXPECTED_PLAN_IDS.includes(planId)),
    ).toBe(true);
    expect(
      reactions.every(({ profileId }) =>
        PROFILE_IDS.some((expected) => expected === profileId),
      ),
    ).toBe(true);
    expect(memories).toHaveLength(1);
    expect(memories[0]?.status).toBe("completed");
    expect(ratings).toHaveLength(2);
    expect(ratings.every(({ memoryId }) => memoryId === memories[0]?.id)).toBe(
      true,
    );
    expect(new Set(ratings.map(({ profileId }) => profileId))).toEqual(
      new Set(PROFILE_IDS),
    );
  });

  it("deixa a FK rejeitar uma relação inválida sem persistir resíduo", async () => {
    let error: unknown;

    try {
      await database.insert(schema.planLinks).values({
        workspaceId: WORKSPACE_ID,
        planId: MISSING_PLAN_ID,
        type: "website",
        url: "https://example.invalid/fk-probe",
      });
    } catch (caught) {
      error = caught;
    }

    expect(postgresErrorCode(error)).toBe("23503");

    const residue = await database
      .select({ id: schema.planLinks.id })
      .from(schema.planLinks)
      .where(eq(schema.planLinks.url, "https://example.invalid/fk-probe"));
    expect(residue).toHaveLength(0);
  });

  it("executa rollback real no driver pooled sem persistir a alteração", async () => {
    const [before] = await database
      .select({ title: schema.plans.title })
      .from(schema.plans)
      .where(eq(schema.plans.id, DECIDING_PLAN_ID));
    const temporaryTitle = `${before?.title ?? ""} [rollback probe]`;
    let mutationObserved = false;
    let rollbackObserved = false;

    try {
      await database.transaction(async (tx) => {
        const [changed] = await tx
          .update(schema.plans)
          .set({ title: temporaryTitle })
          .where(eq(schema.plans.id, DECIDING_PLAN_ID))
          .returning({ title: schema.plans.title });

        mutationObserved = changed?.title === temporaryTitle;
        tx.rollback();
      });
    } catch {
      rollbackObserved = mutationObserved;
    }

    const [after] = await database
      .select({ title: schema.plans.title })
      .from(schema.plans)
      .where(eq(schema.plans.id, DECIDING_PLAN_ID));

    expect(mutationObserved).toBe(true);
    expect(rollbackObserved).toBe(true);
    expect(after?.title).toBe(before?.title);
  });
});
