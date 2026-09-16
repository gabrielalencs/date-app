import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@/db/schema/index.ts";
import {
  archivePlan,
  changePlanStatus,
  createPlan,
  unarchivePlan,
  updatePlan,
} from "@/features/plans/data/mutations";
import {
  countPlansByStatus,
  getPlan,
  listPlans,
} from "@/features/plans/data/queries";
import type { AuthorizedContext } from "@/lib/auth/authorization-core";
import { NotFoundError } from "@/lib/errors";

/**
 * O teste mais importante do B4.
 *
 * Enquanto existir um workspace só, vazamento é indetectável: toda consulta
 * "funciona". Aqui existem dois, e cada função de leitura e de escrita precisa
 * provar que o contexto de A não alcança a entidade de B — nem lendo, nem
 * atualizando, nem arquivando, nem mudando status.
 *
 * O workspace B é criado e apagado por este arquivo, para não sujar o seed.
 */
const WORKSPACE_A = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_B = "33333333-3333-4333-8333-333333333333";
const PROFILE_A = "seed_profile_alex";
const PROFILE_B = "seed_profile_isolation_b";

type DatabaseModule = typeof import("@/db/client.ts");
let databaseModule: DatabaseModule | undefined;
let database: DatabaseModule["db"];

const ctxA: AuthorizedContext = {
  userId: PROFILE_A,
  profileId: PROFILE_A,
  workspaceId: WORKSPACE_A,
  role: "owner",
};

const ctxB: AuthorizedContext = {
  userId: PROFILE_B,
  profileId: PROFILE_B,
  workspaceId: WORKSPACE_B,
  role: "owner",
};

let planoDeB = "";

beforeAll(async () => {
  if (process.env.NEON_BRANCH !== "development") {
    throw new Error("ABORTADO: test:db exige NEON_BRANCH=development.");
  }

  databaseModule = await import("@/db/client.ts");
  database = databaseModule.db;

  await database
    .insert(schema.workspaces)
    .values({ id: WORKSPACE_B, name: "Workspace de isolamento" })
    .onConflictDoNothing();

  await database
    .insert(schema.profiles)
    .values({ id: PROFILE_B, displayName: "Pessoa do B" })
    .onConflictDoNothing();

  await database
    .insert(schema.workspaceMembers)
    .values({ workspaceId: WORKSPACE_B, profileId: PROFILE_B, role: "owner" })
    .onConflictDoNothing();

  const plano = await createPlan(ctxB, {
    title: "Plano que só o B enxerga",
    category: "cultura",
  });
  planoDeB = plano.id;
});

afterAll(async () => {
  // Cascata leva plans, activity_events e membership junto.
  await database
    .delete(schema.workspaces)
    .where(eq(schema.workspaces.id, WORKSPACE_B));
  await database
    .delete(schema.profiles)
    .where(eq(schema.profiles.id, PROFILE_B));

  await databaseModule?.closeDatabasePool();
});

describe("leitura não atravessa o workspace", () => {
  it("getPlan do A não encontra o plano do B", async () => {
    await expect(getPlan(ctxA, planoDeB)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("o B encontra o próprio plano", async () => {
    const plano = await getPlan(ctxB, planoDeB);
    expect(plano.id).toBe(planoDeB);
    expect(plano.workspaceId).toBe(WORKSPACE_B);
  });

  it("listPlans do A nunca devolve linha do B", async () => {
    for (const options of [
      {},
      { status: "open" as const },
      { status: "idea" as const },
      { category: "cultura" },
      { sort: "priority" as const },
      { sort: "budget" as const },
      { includeArchived: true },
    ]) {
      const lista = await listPlans(ctxA, options);
      expect(lista.some((plano) => plano.id === planoDeB)).toBe(false);
    }
  });

  it("countPlansByStatus do B conta só o que é do B", async () => {
    const contagens = await countPlansByStatus(ctxB);
    const total = contagens.reduce((soma, linha) => soma + linha.total, 0);

    // O seed tem oito planos no A; o B tem exatamente um.
    expect(total).toBe(1);
  });
});

describe("escrita não atravessa o workspace", () => {
  it("updatePlan do A não altera o plano do B", async () => {
    await expect(
      updatePlan(ctxA, planoDeB, { title: "invadido" }),
    ).rejects.toBeInstanceOf(NotFoundError);

    const intacto = await getPlan(ctxB, planoDeB);
    expect(intacto.title).toBe("Plano que só o B enxerga");
  });

  it("changePlanStatus do A não move o plano do B", async () => {
    await expect(
      changePlanStatus(ctxA, planoDeB, "deciding"),
    ).rejects.toBeInstanceOf(NotFoundError);

    const intacto = await getPlan(ctxB, planoDeB);
    expect(intacto.status).toBe("idea");
  });

  it("archivePlan do A não arquiva o plano do B", async () => {
    await expect(archivePlan(ctxA, planoDeB)).rejects.toBeInstanceOf(
      NotFoundError,
    );

    const intacto = await getPlan(ctxB, planoDeB);
    expect(intacto.archivedAt).toBeNull();
  });

  it("unarchivePlan do A não restaura o plano do B", async () => {
    await archivePlan(ctxB, planoDeB);

    await expect(unarchivePlan(ctxA, planoDeB)).rejects.toBeInstanceOf(
      NotFoundError,
    );

    const aindaArquivado = await getPlan(ctxB, planoDeB);
    expect(aindaArquivado.archivedAt).not.toBeNull();

    await unarchivePlan(ctxB, planoDeB);
  });

  it("createPlan grava no workspace do contexto, não em outro", async () => {
    const criado = await createPlan(ctxB, {
      title: "Outro plano do B",
      category: "outro",
    });

    expect(criado.workspaceId).toBe(WORKSPACE_B);
    await expect(getPlan(ctxA, criado.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("eventos também respeitam o escopo", () => {
  it("o activity_event da criação nasce no workspace do contexto", async () => {
    const eventos = await database
      .select({ workspaceId: schema.activityEvents.workspaceId })
      .from(schema.activityEvents)
      .where(eq(schema.activityEvents.workspaceId, WORKSPACE_B));

    expect(eventos.length).toBeGreaterThan(0);
    expect(eventos.every((e) => e.workspaceId === WORKSPACE_B)).toBe(true);
  });
});

describe("a assinatura não deixa o caller escolher workspace", () => {
  it("nenhuma função de dados aceita workspaceId", () => {
    // Prova estrutural: o segundo parâmetro é id ou options, nunca workspace.
    expect(getPlan.length).toBe(2);
    expect(updatePlan.length).toBe(3);
    expect(changePlanStatus.length).toBe(3);
    expect(archivePlan.length).toBe(2);
  });

  it("um workspaceId enfiado nas options é ignorado", async () => {
    const comLixo = { status: "open", workspaceId: WORKSPACE_B } as Parameters<
      typeof listPlans
    >[1];

    const lista = await listPlans(ctxA, comLixo);
    expect(lista.some((plano) => plano.id === planoDeB)).toBe(false);
  });
});
