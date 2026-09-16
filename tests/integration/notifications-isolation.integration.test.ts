import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as schema from "@/db/schema/index.ts";
import {
  confirmDateOption,
  createDateOption,
} from "@/features/dates/data/mutations";
import { getPreferences, savePreferences } from "@/features/notifications/data/subscriptions";
import { processIntent } from "@/features/notifications/workflow/steps";
import { listRecoverableIntents } from "@/features/notifications/data/system";
import type {
  PushPayload,
  PushSender,
  PushTarget,
} from "@/features/notifications/send/sender";
import {
  archivePlan,
  changePlanStatus,
  createPlan,
  unarchivePlan,
} from "@/features/plans/data/mutations";
import { toggleReaction } from "@/features/reactions/data/mutations";
import type { AuthorizedContext } from "@/lib/auth/authorization-core";
import { startOfDayInApp } from "@/lib/datetime";

/**
 * O B11.5 contra o banco real.
 *
 * Tudo acontece num workspace próprio, com **duas** pessoas — sem parceiro não
 * existe destinatário e o bloco inteiro seria um no-op silencioso. O workspace A
 * do seed nunca é tocado: o `database.integration.test.ts` afirma que ele tem
 * exatamente os oito planos do seed (D-082).
 */
const WORKSPACE_A = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_N = "99999999-9999-4999-8999-999999999999";
const ATOR = "seed_profile_notif_ator";
const PARCEIRO = "seed_profile_notif_parceiro";

type DatabaseModule = typeof import("@/db/client.ts");
let databaseModule: DatabaseModule | undefined;
let database: DatabaseModule["db"];

const ctx: AuthorizedContext = {
  userId: ATOR,
  profileId: ATOR,
  workspaceId: WORKSPACE_N,
  role: "owner",
};

const ctxParceiro: AuthorizedContext = {
  userId: PARCEIRO,
  profileId: PARCEIRO,
  workspaceId: WORKSPACE_N,
  role: "member",
};

const ctxA: AuthorizedContext = {
  userId: "seed_profile_alex",
  profileId: "seed_profile_alex",
  workspaceId: WORKSPACE_A,
  role: "owner",
};

/** Remetente falso: nenhum byte sai da máquina e o teste vê o que foi enviado. */
function senderFalso(resposta: "sent" | "stale" | "failed" = "sent") {
  const enviados: { target: PushTarget; payload: PushPayload }[] = [];
  const sender: PushSender = async (target, payload) => {
    enviados.push({ target, payload });
    if (resposta === "sent") return { status: "sent", statusCode: 201 };
    if (resposta === "stale") return { status: "stale", statusCode: 410 };
    return { status: "failed", statusCode: 503, errorCode: "http_503" };
  };
  return { sender, enviados };
}

async function intentsDoPlano(planId: string) {
  return database
    .select({
      id: schema.notificationIntents.id,
      kind: schema.notificationIntents.kind,
      status: schema.notificationIntents.status,
      recipientProfileId: schema.notificationIntents.recipientProfileId,
      dedupeKey: schema.notificationIntents.dedupeKey,
      dueAt: schema.notificationIntents.dueAt,
      lastErrorCode: schema.notificationIntents.lastErrorCode,
    })
    .from(schema.notificationIntents)
    .where(eq(schema.notificationIntents.planId, planId));
}

/** Empurra a intent para o passado: o teste não espera quinze minutos. */
async function vencer(intentId: string): Promise<void> {
  await database
    .update(schema.notificationIntents)
    .set({ dueAt: new Date(Date.now() - 60_000) })
    .where(eq(schema.notificationIntents.id, intentId));
}

async function novoPlano(titulo: string): Promise<string> {
  const plano = await createPlan(ctx, { title: titulo, category: "outro" });
  return plano.id;
}

let subscriptionId = "";

beforeAll(async () => {
  if (process.env.NEON_BRANCH !== "development") {
    throw new Error("ABORTADO: test:db exige NEON_BRANCH=development.");
  }

  databaseModule = await import("@/db/client.ts");
  database = databaseModule.db;

  await database
    .insert(schema.workspaces)
    .values({ id: WORKSPACE_N, name: "Workspace de notificações" })
    .onConflictDoNothing();

  await database
    .insert(schema.profiles)
    .values([
      { id: ATOR, displayName: "Alex Notifica" },
      { id: PARCEIRO, displayName: "Nina Recebe" },
    ])
    .onConflictDoNothing();

  await database
    .insert(schema.workspaceMembers)
    .values([
      { workspaceId: WORKSPACE_N, profileId: ATOR, role: "owner" },
      { workspaceId: WORKSPACE_N, profileId: PARCEIRO, role: "member" },
    ])
    .onConflictDoNothing();

  /* Endpoint claramente falso: nada aqui pode parecer credencial de verdade
     numa fixture versionada. */
  const [sub] = await database
    .insert(schema.pushSubscriptions)
    .values({
      workspaceId: WORKSPACE_N,
      profileId: PARCEIRO,
      endpoint: "https://push.invalid/fixture-b115",
      p256dh: "fixture-p256dh",
      auth: "fixture-auth",
    })
    .onConflictDoUpdate({
      target: [schema.pushSubscriptions.endpoint],
      set: { disabledAt: null },
    })
    .returning({ id: schema.pushSubscriptions.id });

  subscriptionId = sub!.id;
});

beforeEach(async () => {
  /* A subscription volta a ativa: o teste de stale a desativa de propósito. */
  await database
    .update(schema.pushSubscriptions)
    .set({ disabledAt: null })
    .where(eq(schema.pushSubscriptions.id, subscriptionId));
});

afterAll(async () => {
  await database
    .delete(schema.workspaces)
    .where(eq(schema.workspaces.id, WORKSPACE_N));
  await database
    .delete(schema.profiles)
    .where(eq(schema.profiles.id, ATOR));
  await database
    .delete(schema.profiles)
    .where(eq(schema.profiles.id, PARCEIRO));
  await databaseModule?.closeDatabasePool();
});

describe("a intenção nasce na transação do domínio", () => {
  it("criar plano enfileira uma intent para o parceiro, e só para ele", async () => {
    const planId = await novoPlano("Plano que notifica");
    const intents = await intentsDoPlano(planId);

    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({
      kind: "plan_created",
      status: "pending",
      recipientProfileId: PARCEIRO,
    });
  });

  it("favoritar é silencioso; quero muito não é", async () => {
    const planId = await novoPlano("Plano com reações");

    await toggleReaction(ctx, planId, "favorite");
    expect(
      (await intentsDoPlano(planId)).filter((i) => i.kind === "want_a_lot"),
    ).toHaveLength(0);

    await toggleReaction(ctx, planId, "want_a_lot");
    expect(
      (await intentsDoPlano(planId)).filter((i) => i.kind === "want_a_lot"),
    ).toHaveLength(1);
  });

  it("quatro datas sugeridas viram uma intent só", async () => {
    const planId = await novoPlano("Plano com quatro datas");
    const dia = { year: 2027, month: 6, day: 10 };

    for (let i = 0; i < 4; i += 1) {
      await createDateOption(ctx, planId, {
        startsAt: new Date(
          startOfDayInApp(dia).getTime() + (18 + i) * 60 * 60_000,
        ),
      });
    }

    const sugeridas = (await intentsDoPlano(planId)).filter(
      (i) => i.kind === "date_suggested",
    );
    expect(sugeridas).toHaveLength(1);
  });

  it("confirmar data cria o aviso e os quatro lembretes para os dois", async () => {
    const planId = await novoPlano("Plano que confirma");
    const opcao = await createDateOption(ctx, planId, {
      startsAt: new Date(
        startOfDayInApp({ year: 2027, month: 6, day: 20 }).getTime() +
          20 * 60 * 60_000,
      ),
    });

    await confirmDateOption(ctx, opcao.id);

    const intents = await intentsDoPlano(planId);
    const confirmacao = intents.filter((i) => i.kind === "date_confirmed");
    const lembretes = intents.filter((i) => i.kind === "date_reminder");

    /* Um aviso para o parceiro; quatro lembretes × duas pessoas. */
    expect(confirmacao).toHaveLength(1);
    expect(confirmacao[0]!.recipientProfileId).toBe(PARCEIRO);
    expect(lembretes).toHaveLength(8);
    expect(new Set(lembretes.map((l) => l.recipientProfileId))).toEqual(
      new Set([ATOR, PARCEIRO]),
    );
  });

  it("cancelar o plano cancela os lembretes pendentes", async () => {
    const planId = await novoPlano("Plano que cancela");
    const opcao = await createDateOption(ctx, planId, {
      startsAt: new Date(
        startOfDayInApp({ year: 2027, month: 7, day: 5 }).getTime() +
          20 * 60 * 60_000,
      ),
    });
    await confirmDateOption(ctx, opcao.id);
    await changePlanStatus(ctx, planId, "cancelled");

    const lembretes = (await intentsDoPlano(planId)).filter(
      (i) => i.kind === "date_reminder",
    );
    expect(lembretes.every((l) => l.status === "cancelled")).toBe(true);
  });
});

describe("o workspace de fora não enxerga nada", () => {
  it("as intents do N não aparecem numa leitura do A", async () => {
    const planId = await novoPlano("Plano invisível para o A");
    const doN = await intentsDoPlano(planId);
    expect(doN.length).toBeGreaterThan(0);

    const doA = await database
      .select({ id: schema.notificationIntents.id })
      .from(schema.notificationIntents)
      .where(
        and(
          eq(schema.notificationIntents.workspaceId, ctxA.workspaceId),
          eq(schema.notificationIntents.planId, planId),
        ),
      );

    expect(doA).toHaveLength(0);
  });

  it("as preferências são por pessoa e por workspace", async () => {
    await savePreferences(ctx, { previewMode: "full" });

    expect((await getPreferences(ctx)).previewMode).toBe("full");
    /* O parceiro não herda a escolha do ator, e o default é o privado. */
    expect((await getPreferences(ctxParceiro)).previewMode).toBe("private");

    await savePreferences(ctx, { previewMode: "private" });
  });

  it("a subscription do parceiro não pertence a outra pessoa", async () => {
    const doAtor = await database
      .select({ id: schema.pushSubscriptions.id })
      .from(schema.pushSubscriptions)
      .where(
        and(
          eq(schema.pushSubscriptions.workspaceId, WORKSPACE_N),
          eq(schema.pushSubscriptions.profileId, ATOR),
        ),
      );

    expect(doAtor).toHaveLength(0);
  });
});

describe("o estado desfeito não vira push", () => {
  it("criar e arquivar antes do prazo suprime", async () => {
    const planId = await novoPlano("Plano arquivado cedo");
    const [intent] = await intentsDoPlano(planId);
    await vencer(intent!.id);

    await archivePlan(ctx, planId);

    const { sender, enviados } = senderFalso();
    expect(await processIntent(intent!.id, sender)).toBe("suppressed");
    expect(enviados).toHaveLength(0);

    const [depois] = await intentsDoPlano(planId).then((rows) =>
      rows.filter((r) => r.id === intent!.id),
    );
    expect(depois!.status).toBe("suppressed");
    expect(depois!.lastErrorCode).toContain("arquivad");

    await unarchivePlan(ctx, planId);
  });

  it("quero muito retirado antes do prazo suprime", async () => {
    const planId = await novoPlano("Plano com want retirado");
    await toggleReaction(ctx, planId, "want_a_lot");
    const [intent] = (await intentsDoPlano(planId)).filter(
      (i) => i.kind === "want_a_lot",
    );
    await vencer(intent!.id);

    await toggleReaction(ctx, planId, "want_a_lot");

    const { sender, enviados } = senderFalso();
    expect(await processIntent(intent!.id, sender)).toBe("suppressed");
    expect(enviados).toHaveLength(0);
  });

  it("confirmar A e depois B nunca produz mensagem sobre A", async () => {
    const planId = await novoPlano("Plano que troca de data");
    const base = startOfDayInApp({ year: 2027, month: 8, day: 12 }).getTime();
    const a = await createDateOption(ctx, planId, {
      startsAt: new Date(base + 19 * 60 * 60_000),
    });
    const b = await createDateOption(ctx, planId, {
      startsAt: new Date(base + 24 * 60 * 60_000 + 19 * 60 * 60_000),
    });

    await confirmDateOption(ctx, a.id);
    const lembretesDeA = (await intentsDoPlano(planId)).filter(
      (i) => i.kind === "date_reminder",
    );
    expect(lembretesDeA.length).toBeGreaterThan(0);

    await confirmDateOption(ctx, b.id);

    /* Primeira garantia: os lembretes de A foram cancelados na mesma transação
       que confirmou B. */
    const depoisDeB = await intentsDoPlano(planId);
    const cancelados = depoisDeB.filter(
      (i) => lembretesDeA.some((l) => l.id === i.id) && i.status === "cancelled",
    );
    expect(cancelados).toHaveLength(lembretesDeA.length);

    /* Segunda garantia, que é a que importa: uma intent que ainda **afirma A**
       encontra B no banco e se cala. É o caso do workflow que dormiu antes da
       troca e acordou depois dela — o cancelamento é conveniência, a
       revalidação é a barreira.

       Reproduzido escrevendo `expected` de volta para A na intent aberta, em
       vez de ressuscitar uma cancelada: ressuscitar colidiria com o único
       parcial, porque o lembrete de B já ocupa a mesma chave — o que é, por si,
       a prova de que dois conjuntos de lembretes não coexistem. */
    const [aviso] = depoisDeB.filter((i) => i.kind === "date_confirmed");
    expect(aviso!.status).toBe("pending");

    await database
      .update(schema.notificationIntents)
      .set({ expected: { confirmedOptionId: a.id, dayKey: "2027-08-12" } })
      .where(eq(schema.notificationIntents.id, aviso!.id));
    await vencer(aviso!.id);

    const { sender, enviados } = senderFalso();
    expect(await processIntent(aviso!.id, sender)).toBe("suppressed");
    expect(enviados).toHaveLength(0);
  });

  it("o plano ativo envia de verdade", async () => {
    const planId = await novoPlano("Plano que chega");
    const [intent] = await intentsDoPlano(planId);
    await vencer(intent!.id);

    const { sender, enviados } = senderFalso();
    expect(await processIntent(intent!.id, sender)).toBe("sent");
    expect(enviados).toHaveLength(1);
    /* O default é `private`: o lock screen não recebe o título do date. */
    expect(enviados[0]!.payload.title).toBe("Tem novidade no DATE");
    expect(enviados[0]!.payload.url).toBe(`/planos/${planId}`);
  });
});

describe("idempotência", () => {
  it("processar duas vezes envia uma vez", async () => {
    const planId = await novoPlano("Plano processado duas vezes");
    const [intent] = await intentsDoPlano(planId);
    await vencer(intent!.id);

    const primeiro = senderFalso();
    expect(await processIntent(intent!.id, primeiro.sender)).toBe("sent");

    /* A segunda execução não pega o claim: a intent já saiu de `pending`. */
    const segundo = senderFalso();
    expect(await processIntent(intent!.id, segundo.sender)).toBe("skipped");
    expect(segundo.enviados).toHaveLength(0);

    const entregas = await database
      .select({ id: schema.notificationDeliveries.id })
      .from(schema.notificationDeliveries)
      .where(eq(schema.notificationDeliveries.intentId, intent!.id));
    expect(entregas).toHaveLength(1);
  });

  it("a mesma dupla intent+subscription não ganha segunda linha", async () => {
    const planId = await novoPlano("Plano com entrega única");
    const [intent] = await intentsDoPlano(planId);
    await vencer(intent!.id);
    await processIntent(intent!.id, senderFalso().sender);

    /* Reabre a intent à força para simular um step repetido pelo Workflow. */
    await database
      .update(schema.notificationIntents)
      .set({ status: "pending" })
      .where(eq(schema.notificationIntents.id, intent!.id));

    const repetido = senderFalso();
    await processIntent(intent!.id, repetido.sender);

    /* O único (intent_id, subscription_id) impede a segunda linha, e por isso
       o remetente não é chamado de novo: aquele navegador já recebeu. */
    expect(repetido.enviados).toHaveLength(0);

    const entregas = await database
      .select({ id: schema.notificationDeliveries.id })
      .from(schema.notificationDeliveries)
      .where(eq(schema.notificationDeliveries.intentId, intent!.id));
    expect(entregas).toHaveLength(1);
  });

  it("410 desativa a subscription; 503 não encosta nela", async () => {
    const planA = await novoPlano("Plano com push stale");
    const [intentA] = await intentsDoPlano(planA);
    await vencer(intentA!.id);
    await processIntent(intentA!.id, senderFalso("stale").sender);

    const [depoisStale] = await database
      .select({ disabledAt: schema.pushSubscriptions.disabledAt })
      .from(schema.pushSubscriptions)
      .where(eq(schema.pushSubscriptions.id, subscriptionId));
    expect(depoisStale!.disabledAt).not.toBeNull();

    await database
      .update(schema.pushSubscriptions)
      .set({ disabledAt: null })
      .where(eq(schema.pushSubscriptions.id, subscriptionId));

    const planB = await novoPlano("Plano com push temporário");
    const [intentB] = await intentsDoPlano(planB);
    await vencer(intentB!.id);
    await processIntent(intentB!.id, senderFalso("failed").sender);

    const [depoisFalha] = await database
      .select({ disabledAt: schema.pushSubscriptions.disabledAt })
      .from(schema.pushSubscriptions)
      .where(eq(schema.pushSubscriptions.id, subscriptionId));
    expect(depoisFalha!.disabledAt).toBeNull();
  });
});

describe("recovery", () => {
  it("encontra pendentes vencidas e não encontra as já resolvidas", async () => {
    const planId = await novoPlano("Plano para o recovery");
    const [intent] = await intentsDoPlano(planId);
    await vencer(intent!.id);

    const antes = await listRecoverableIntents(new Date(), 500);
    expect(antes.map((i) => i.id)).toContain(intent!.id);

    await processIntent(intent!.id, senderFalso().sender);

    const depois = await listRecoverableIntents(new Date(), 500);
    expect(depois.map((i) => i.id)).not.toContain(intent!.id);
  });

  it("não devolve intent que ainda não venceu", async () => {
    const planId = await novoPlano("Plano com intent no futuro");
    const [intent] = await intentsDoPlano(planId);

    const pendentes = await listRecoverableIntents(new Date(), 500);
    expect(pendentes.map((i) => i.id)).not.toContain(intent!.id);
  });
});
