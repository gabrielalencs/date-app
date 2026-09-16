import "server-only";

import { and, asc, eq, isNull, lte, sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
  memoryRatings,
  notificationDeliveries,
  notificationIntents,
  notificationPreferences,
  planDateOptions,
  planDateVotes,
  plans,
  profiles,
  pushSubscriptions,
  reactions,
  reservations,
  workspaceMembers,
} from "@/db/schema/index.ts";
import {
  isNotificationKind,
  type NotificationKind,
} from "@/features/notifications/kinds";
import type {
  Expected,
  PlanFacts,
} from "@/features/notifications/policy/revalidate";
import type { PreviewMode } from "@/features/notifications/templates";
import { dayKey } from "@/lib/datetime";
import type { PlanStatus } from "@/lib/status";

/**
 * A FRONTEIRA DE SISTEMA.
 *
 * Exceção arquitetural declarada, e a única do projeto (seção 4 do
 * docs/NOTIFICATIONS.md). Todo o resto de `features/*​/data/` recebe
 * `AuthorizedContext` como primeiro parâmetro, porque toda leitura nasce de uma
 * pessoa autenticada. Aqui não existe pessoa: quem chama é o Workflow acordando
 * de um sleep de sete dias, ou o Cron de recovery.
 *
 * O que substitui a autorização é uma restrição mais estreita, não mais larga:
 *
 * - a única entrada é um `intentId` que **já está persistido**;
 * - o `workspaceId` é **lido da linha**, nunca aceito de quem chamou;
 * - nenhuma função daqui aceita `workspaceId`, `profileId` ou filtro vindo de
 *   fora — se aceitasse, um POST forjado no endpoint de recovery viraria
 *   leitura de dado alheio;
 * - nada daqui é exportado para Server Action, página ou componente.
 *
 * `docs/DATA_ACCESS.md` seção 3 continua valendo para o resto do projeto. O que
 * esta fronteira faz é ser pequena o bastante para caber num parágrafo.
 */

export type IntentRow = {
  id: string;
  workspaceId: string;
  recipientProfileId: string;
  actorProfileId: string | null;
  planId: string | null;
  kind: NotificationKind;
  dedupeKey: string;
  dueAt: Date;
  expected: Expected;
  status: string;
};

function paraKind(valor: string): NotificationKind {
  if (!isNotificationKind(valor)) {
    throw new Error(`Kind fora da lista canônica: ${valor}`);
  }
  return valor;
}

/** Lê a intent sem tocar no status. Usado para decidir se ainda vale acordar. */
export async function readIntent(intentId: string): Promise<IntentRow | null> {
  const [linha] = await db
    .select({
      id: notificationIntents.id,
      workspaceId: notificationIntents.workspaceId,
      recipientProfileId: notificationIntents.recipientProfileId,
      actorProfileId: notificationIntents.actorProfileId,
      planId: notificationIntents.planId,
      kind: notificationIntents.kind,
      dedupeKey: notificationIntents.dedupeKey,
      dueAt: notificationIntents.dueAt,
      expected: notificationIntents.expected,
      status: notificationIntents.status,
    })
    .from(notificationIntents)
    .where(eq(notificationIntents.id, intentId))
    .limit(1);

  if (!linha) return null;

  return {
    ...linha,
    kind: paraKind(linha.kind),
    expected: (linha.expected ?? {}) as Expected,
  };
}

/**
 * Toma posse da intent, uma vez só.
 *
 * O `where` inclui `status = 'pending'`, então duas execuções simultâneas do
 * mesmo run — ou o run e o recovery ao mesmo tempo — disputam o UPDATE e
 * exatamente uma leva o `RETURNING`. A outra recebe `null` e vai embora sem
 * enviar nada. É a trava, e ela é uma linha de SQL em vez de um lock externo.
 */
export async function claimIntent(intentId: string): Promise<IntentRow | null> {
  const [linha] = await db
    .update(notificationIntents)
    .set({
      status: "processing",
      attemptCount: sql`${notificationIntents.attemptCount} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(notificationIntents.id, intentId),
        eq(notificationIntents.status, "pending"),
      ),
    )
    .returning({
      id: notificationIntents.id,
      workspaceId: notificationIntents.workspaceId,
      recipientProfileId: notificationIntents.recipientProfileId,
      actorProfileId: notificationIntents.actorProfileId,
      planId: notificationIntents.planId,
      kind: notificationIntents.kind,
      dedupeKey: notificationIntents.dedupeKey,
      dueAt: notificationIntents.dueAt,
      expected: notificationIntents.expected,
      status: notificationIntents.status,
    });

  if (!linha) return null;

  return {
    ...linha,
    kind: paraKind(linha.kind),
    expected: (linha.expected ?? {}) as Expected,
  };
}

export async function finishIntent(
  intentId: string,
  status: "sent" | "suppressed" | "failed" | "pending",
  errorCode?: string,
): Promise<void> {
  await db
    .update(notificationIntents)
    .set({
      status,
      sentAt: status === "sent" ? new Date() : null,
      lastErrorCode: errorCode ?? null,
      updatedAt: new Date(),
    })
    .where(eq(notificationIntents.id, intentId));
}

export async function attachWorkflowRun(
  intentId: string,
  runId: string,
): Promise<void> {
  await db
    .update(notificationIntents)
    .set({ workflowRunId: runId, updatedAt: new Date() })
    .where(eq(notificationIntents.id, intentId));
}

/**
 * Os fatos de agora, para a revalidação.
 *
 * Uma consulta por assunto e nenhuma por linha. Tudo é escopado pelo
 * `workspaceId` **da intent**, que veio do banco — o chamador não tem como
 * apontar para outro.
 */
export async function loadPlanFacts(intent: IntentRow): Promise<PlanFacts> {
  const vazio: PlanFacts = {
    exists: false,
    title: "",
    status: "idea",
    archived: false,
    confirmedOptionId: null,
    confirmedDayKey: null,
    confirmedStartsAt: null,
    reservationStatus: null,
    actorWantsALot: false,
    actorOpenOptionCount: 0,
    actorVote: null,
    actorRatingExists: false,
  };

  if (!intent.planId) return vazio;

  const [plano] = await db
    .select({
      id: plans.id,
      title: plans.title,
      status: plans.status,
      archivedAt: plans.archivedAt,
    })
    .from(plans)
    .where(
      and(
        eq(plans.workspaceId, intent.workspaceId),
        eq(plans.id, intent.planId),
      ),
    )
    .limit(1);

  if (!plano) return vazio;

  const [confirmada] = await db
    .select({
      id: planDateOptions.id,
      startsAt: planDateOptions.startsAt,
    })
    .from(planDateOptions)
    .where(
      and(
        eq(planDateOptions.workspaceId, intent.workspaceId),
        eq(planDateOptions.planId, intent.planId),
        eq(planDateOptions.isConfirmed, true),
      ),
    )
    .limit(1);

  const [reserva] = await db
    .select({ status: reservations.status })
    .from(reservations)
    .where(
      and(
        eq(reservations.workspaceId, intent.workspaceId),
        eq(reservations.planId, intent.planId),
      ),
    )
    .limit(1);

  const ator = intent.actorProfileId;

  const [quero] = ator
    ? await db
        .select({ id: reactions.id })
        .from(reactions)
        .where(
          and(
            eq(reactions.workspaceId, intent.workspaceId),
            eq(reactions.planId, intent.planId),
            eq(reactions.profileId, ator),
            eq(reactions.type, "want_a_lot"),
          ),
        )
        .limit(1)
    : [];

  const opcoesDoAtor = ator
    ? await db
        .select({ id: planDateOptions.id })
        .from(planDateOptions)
        .where(
          and(
            eq(planDateOptions.workspaceId, intent.workspaceId),
            eq(planDateOptions.planId, intent.planId),
            eq(planDateOptions.createdBy, ator),
          ),
        )
    : [];

  const [voto] =
    ator && intent.expected.optionId
      ? await db
          .select({ vote: planDateVotes.vote })
          .from(planDateVotes)
          .where(
            and(
              eq(planDateVotes.workspaceId, intent.workspaceId),
              eq(planDateVotes.optionId, intent.expected.optionId),
              eq(planDateVotes.profileId, ator),
            ),
          )
          .limit(1)
      : [];

  const [avaliacao] = ator
    ? await db
        .select({ id: memoryRatings.id })
        .from(memoryRatings)
        .where(
          and(
            eq(memoryRatings.workspaceId, intent.workspaceId),
            eq(memoryRatings.planId, intent.planId),
            eq(memoryRatings.profileId, ator),
          ),
        )
        .limit(1)
    : [];

  return {
    exists: true,
    title: plano.title,
    status: plano.status as PlanStatus,
    archived: plano.archivedAt !== null,
    confirmedOptionId: confirmada?.id ?? null,
    confirmedDayKey: confirmada ? dayKey(confirmada.startsAt) : null,
    confirmedStartsAt: confirmada?.startsAt ?? null,
    reservationStatus: reserva?.status ?? null,
    actorWantsALot: Boolean(quero),
    actorOpenOptionCount: opcoesDoAtor.length,
    actorVote: voto?.vote ?? null,
    actorRatingExists: Boolean(avaliacao),
  };
}

export type RecipientProfile = {
  previewMode: PreviewMode;
  pushEnabled: boolean;
  activityEnabled: boolean;
  dateRemindersEnabled: boolean;
};

/**
 * As preferências de quem vai receber. Sem linha, valem os defaults — e o
 * default de `preview_mode` é `private`, porque o lock screen é público para
 * quem estiver perto da pessoa.
 */
export async function loadRecipientPreferences(
  intent: IntentRow,
): Promise<RecipientProfile> {
  const [linha] = await db
    .select({
      previewMode: notificationPreferences.previewMode,
      pushEnabled: notificationPreferences.pushEnabled,
      activityEnabled: notificationPreferences.activityEnabled,
      dateRemindersEnabled: notificationPreferences.dateRemindersEnabled,
    })
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.workspaceId, intent.workspaceId),
        eq(notificationPreferences.profileId, intent.recipientProfileId),
      ),
    )
    .limit(1);

  return {
    previewMode: (linha?.previewMode ?? "private") as PreviewMode,
    pushEnabled: linha?.pushEnabled ?? true,
    activityEnabled: linha?.activityEnabled ?? true,
    dateRemindersEnabled: linha?.dateRemindersEnabled ?? true,
  };
}

export type DeliverableSubscription = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

/** Só as subscriptions ativas de quem vai receber. */
export async function loadActiveSubscriptions(
  intent: IntentRow,
): Promise<DeliverableSubscription[]> {
  return db
    .select({
      id: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.workspaceId, intent.workspaceId),
        eq(pushSubscriptions.profileId, intent.recipientProfileId),
        isNull(pushSubscriptions.disabledAt),
      ),
    );
}

/** O primeiro nome de quem agiu, para a copy. */
export async function loadActorName(
  intent: IntentRow,
): Promise<string | undefined> {
  if (!intent.actorProfileId) return undefined;

  const [linha] = await db
    .select({ displayName: profiles.displayName })
    .from(profiles)
    .where(eq(profiles.id, intent.actorProfileId))
    .limit(1);

  return linha?.displayName.split(" ")[0];
}

/**
 * Reserva a entrega antes de tentar enviar.
 *
 * O insert mira o único `(intent_id, subscription_id)`: se a linha já existe
 * como `sent`, o `onConflictDoNothing` não devolve nada e o chamador sabe que
 * aquele navegador já recebeu. É assim que um step repetido do Workflow deixa
 * de virar uma segunda notificação no telefone da pessoa.
 */
export async function reserveDelivery(
  intent: IntentRow,
  subscriptionId: string,
): Promise<boolean> {
  const linhas = await db
    .insert(notificationDeliveries)
    .values({
      workspaceId: intent.workspaceId,
      intentId: intent.id,
      subscriptionId,
      status: "pending",
    })
    .onConflictDoNothing({
      target: [
        notificationDeliveries.intentId,
        notificationDeliveries.subscriptionId,
      ],
    })
    .returning({ id: notificationDeliveries.id });

  return linhas.length > 0;
}

export async function recordDeliveryResult(
  intent: IntentRow,
  subscriptionId: string,
  result: {
    status: "sent" | "stale" | "failed";
    statusCode?: number;
    errorCode?: string;
  },
): Promise<void> {
  await db
    .update(notificationDeliveries)
    .set({
      status: result.status,
      lastStatusCode: result.statusCode ?? null,
      lastErrorCode: result.errorCode ?? null,
      sentAt: result.status === "sent" ? new Date() : null,
      attemptCount: sql`${notificationDeliveries.attemptCount} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(notificationDeliveries.intentId, intent.id),
        eq(notificationDeliveries.subscriptionId, subscriptionId),
      ),
    );

  if (result.status === "sent") {
    await db
      .update(pushSubscriptions)
      .set({ lastSuccessAt: new Date(), updatedAt: new Date() })
      .where(eq(pushSubscriptions.id, subscriptionId));
  }

  /* 404/410: aquele navegador não existe mais. Desativar, nunca apagar — a
     linha continua explicando as entregas históricas. Erro temporário não
     encosta em subscription saudável. */
  if (result.status === "stale") {
    await db
      .update(pushSubscriptions)
      .set({ disabledAt: new Date(), updatedAt: new Date() })
      .where(eq(pushSubscriptions.id, subscriptionId));
  }
}

/**
 * O que o recovery procura: intents que já venceram e continuam pendentes.
 *
 * Inclui as que nunca receberam `workflow_run_id` — o caso do `start()` ter
 * falhado depois do commit — e as que têm run mas não andaram. Em nenhum caso
 * ele reenvia: ele só reinicia o workflow, e o claim decide quem processa.
 */
export async function listRecoverableIntents(
  now: Date,
  limit = 100,
): Promise<{ id: string }[]> {
  return db
    .select({ id: notificationIntents.id })
    .from(notificationIntents)
    .where(
      /* Pendente e vencida. Cobre os dois casos que o recovery existe para
         reparar: o `start()` que falhou depois do commit, e o run que existe
         mas não andou. Distinguir os dois aqui não muda o que se faz com eles,
         e o claim decide quem processa. */
      and(
        eq(notificationIntents.status, "pending"),
        lte(notificationIntents.dueAt, now),
      ),
    )
    .orderBy(asc(notificationIntents.dueAt))
    .limit(limit);
}

/** Os dois membros do workspace, para o backfill de lembretes. */
export async function loadWorkspaceMemberIds(
  workspaceId: string,
): Promise<string[]> {
  const linhas = await db
    .select({ profileId: workspaceMembers.profileId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.workspaceId, workspaceId));

  return linhas.map((linha) => linha.profileId);
}
