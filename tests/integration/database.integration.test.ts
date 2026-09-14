import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@/db/schema/index.ts";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const PROFILE_IDS = ["seed_profile_alex", "seed_profile_nina"] as const;
const DECIDING_PLAN_ID = "22222222-0000-4000-8000-000000000003";
const RESERVED_PLAN_ID = "22222222-0000-4000-8000-000000000006";
const COMPLETED_PLAN_ID = "22222222-0000-4000-8000-000000000007";
const MISSING_PLAN_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
/* Onze depois do B9: os oito originais mais três realizados, para `/memorias`
   ter mais de um mês de histórico e para a virada de mês existir no dado real
   (D-102). */
const EXPECTED_PLAN_IDS = Array.from(
  { length: 11 },
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
  it("mantém os perfis do seed como autores e exatamente dois membros reais", async () => {
    const workspace = await database
      .select({ id: schema.workspaces.id })
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, WORKSPACE_ID));
    const profiles = await database
      .select({ id: schema.profiles.id })
      .from(schema.profiles)
      .where(inArray(schema.profiles.id, [...PROFILE_IDS]));

    /* Agora a tabela inteira, não o recorte dos ids do seed. A asserção mudou
       de lado com o D-084: antes se afirmava que Alex e Nina continuavam
       ligados; agora se afirma que eles NÃO estão, e que o workspace de
       development tem exatamente os dois membros reais. O recorte anterior era
       incapaz de ver as quatro memberships que existiam de fato. */
    const members = await database
      .select({ profileId: schema.workspaceMembers.profileId })
      .from(schema.workspaceMembers)
      .where(eq(schema.workspaceMembers.workspaceId, WORKSPACE_ID));

    expect(workspace).toEqual([{ id: WORKSPACE_ID }]);

    // Os dois perfis continuam existindo: eles assinam `created_by`.
    expect(profiles.map(({ id }) => id).sort()).toEqual(
      [...PROFILE_IDS].sort(),
    );

    expect(members).toHaveLength(2);
    expect(
      members.some(({ profileId }) =>
        (PROFILE_IDS as readonly string[]).includes(profileId),
      ),
    ).toBe(false);
  });

  it("mantém os perfis do seed como autores de planos e opções", async () => {
    const autoresDePlano = await database
      .select({ createdBy: schema.plans.createdBy })
      .from(schema.plans)
      .where(
        and(
          eq(schema.plans.workspaceId, WORKSPACE_ID),
          inArray(schema.plans.id, EXPECTED_PLAN_IDS),
        ),
      );

    /* A contrapartida do D-084: tirar Alex e Nina de workspace_members não
       pode apagá-los do produto. Eles continuam sendo quem criou cada plano do
       seed, que é o que dá corpo à tela. */
    expect(autoresDePlano).toHaveLength(EXPECTED_PLAN_IDS.length);
    expect(new Set(autoresDePlano.map(({ createdBy }) => createdBy))).toEqual(
      new Set(PROFILE_IDS),
    );
  });

  it("mantém os onze plans do seed, sem duplicar, cobrindo os seis status", async () => {
    const plans = await database
      .select({
        id: schema.plans.id,
        workspaceId: schema.plans.workspaceId,
        status: schema.plans.status,
      })
      .from(schema.plans)
      .where(eq(schema.plans.workspaceId, WORKSPACE_ID));

    /* Os onze do seed existem e aparecem uma vez cada. Não se afirma que o
       workspace tem SÓ eles: plano criado à mão ou por outra suíte é dado
       legítimo do produto, e proibi-lo fazia esta asserção quebrar por uso
       normal em vez de por defeito do seed. */
    const doSeed = plans
      .map(({ id }) => id)
      .filter((id) => EXPECTED_PLAN_IDS.includes(id))
      .sort();

    expect(doSeed).toEqual(EXPECTED_PLAN_IDS);
    expect(plans.every(({ workspaceId }) => workspaceId === WORKSPACE_ID)).toBe(
      true,
    );

    const statusDoSeed = plans
      .filter(({ id }) => EXPECTED_PLAN_IDS.includes(id))
      .map(({ status }) => status);

    expect(new Set(statusDoSeed)).toEqual(
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

    /* Voto é ato de membro (D-084), então quem votou são as contas reais e não
       Alex e Nina. A asserção deixa de nomear profiles e passa a exigir que
       todo voto pertença a um membro do workspace — que é a invariante de
       verdade, e a que continuaria valendo se as contas mudassem. */
    const membros = await database
      .select({ profileId: schema.workspaceMembers.profileId })
      .from(schema.workspaceMembers)
      .where(eq(schema.workspaceMembers.workspaceId, WORKSPACE_ID));
    const idsDeMembro = new Set(membros.map(({ profileId }) => profileId));

    expect(options).toHaveLength(3);
    expect(votes).toHaveLength(4);
    expect(votes.every(({ profileId }) => idsDeMembro.has(profileId))).toBe(
      true,
    );
    expect(
      votes.every(
        ({ profileId }) =>
          !(PROFILE_IDS as readonly string[]).includes(profileId),
      ),
    ).toBe(true);
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

  it("liga reactions aos profiles/plans e as avaliações a dates realizados", async () => {
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
    /* Não há mais tabela `memories`: a avaliação aponta direto para o plano
       (D-099). O join com `plans` é o que prova o que a antiga afirmava — que
       toda avaliação pertence a um date realizado. */
    const ratings = await database
      .select({
        planId: schema.memoryRatings.planId,
        profileId: schema.memoryRatings.profileId,
        status: schema.plans.status,
      })
      .from(schema.memoryRatings)
      .innerJoin(schema.plans, eq(schema.memoryRatings.planId, schema.plans.id))
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
    /* Três avaliações em dois planos: duas num (que por isso tem média) e uma
       no outro (que por isso não tem). O seed só as lança quando o workspace
       tem dois membros, então zero é resultado legítimo num banco sem
       bootstrap — o que se afirma sempre é que nenhuma pertence a plano que
       não esteja realizado. */
    expect(ratings.every(({ status }) => status === "completed")).toBe(true);
    expect(
      ratings.every(({ planId }) => EXPECTED_PLAN_IDS.includes(planId)),
    ).toBe(true);

    if (ratings.length > 0) {
      expect(ratings).toHaveLength(3);
      expect(new Set(ratings.map(({ planId }) => planId)).size).toBe(2);
    }
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
