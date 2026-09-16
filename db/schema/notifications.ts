import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  notificationDeliveryStatus,
  notificationIntentStatus,
  notificationPreviewMode,
} from "./enums.ts";
import { profiles, workspaces } from "./identity.ts";
import { plans } from "./plans.ts";

/**
 * As quatro tabelas do B11.5 (seção 5 do docs/NOTIFICATIONS.md).
 *
 * A tese do bloco está no schema: `notification_intents` guarda **fatos de
 * revalidação**, não texto. O texto é renderizado no envio, a partir do estado
 * que existir naquele momento. Uma intent que afirma "está planejado para
 * sábado" e encontra o plano cancelado não vira mensagem — vira `suppressed`.
 *
 * Por isso não existe coluna `title` nem `body` aqui. Guardar o texto no
 * momento do clique seria congelar uma afirmação que ainda pode deixar de ser
 * verdade, que é exatamente o defeito que o bloco existe para evitar.
 */

/**
 * Uma subscription por navegador/dispositivo. Uma pessoa com celular e
 * notebook tem duas, e o push vai para as duas.
 *
 * `endpoint`, `p256dh` e `auth` são credenciais de entrega: quem tiver os três
 * consegue mandar notificação para aquele navegador. Nunca entram em log, nunca
 * voltam para o cliente e nunca aparecem em fixture versionada.
 */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Última entrega aceita pelo push service. Diagnóstico, não autoridade. */
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    /**
     * Preenchido quando o push service responde 404/410: aquele navegador não
     * existe mais. Desativar em vez de apagar preserva a linha para diagnóstico
     * e mantém as deliveries históricas com FK válida.
     */
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
  },
  (table) => [
    /* Global, não por workspace: o endpoint identifica o navegador, e o mesmo
       navegador não pode acabar com duas linhas se a pessoa reinstalar. */
    unique("push_subscriptions_endpoint_unique").on(table.endpoint),
    index("push_subscriptions_profile_idx").on(
      table.workspaceId,
      table.profileId,
    ),
  ],
);

/**
 * Preferências por pessoa. A chave é (workspace, profile) — a mesma forma de
 * `workspace_members`, porque a preferência pertence à participação, não à
 * conta global.
 */
export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    pushEnabled: boolean("push_enabled").notNull().default(true),
    activityEnabled: boolean("activity_enabled").notNull().default(true),
    dateRemindersEnabled: boolean("date_reminders_enabled")
      .notNull()
      .default(true),
    /* `private` é o default, e é decisão de produto: o lock screen é público
       para quem estiver perto da pessoa. Mostrar o nome do date é opt-in. */
    previewMode: notificationPreviewMode("preview_mode")
      .notNull()
      .default("private"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.profileId] })],
);

/**
 * A intenção de notificar. Nasce dentro da transação do domínio e espera.
 *
 * `kind` é `text` de propósito, pela mesma razão de `plans.category` (D-026):
 * a lista canônica vive na aplicação e acrescentar copy nova não pode exigir
 * migration.
 */
export const notificationIntents = pgTable(
  "notification_intents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    recipientProfileId: text("recipient_profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    /** Nulo em lembrete de calendário, que não tem ator. */
    actorProfileId: text("actor_profile_id").references(() => profiles.id, {
      onDelete: "cascade",
    }),
    planId: uuid("plan_id").references(() => plans.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    /**
     * Janela de agregação e de deduplicação. Quatro datas sugeridas no mesmo
     * debounce compartilham a chave e viram **uma** notificação, não quatro.
     */
    dedupeKey: text("dedupe_key").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    /**
     * Só fatos de revalidação, nunca texto. Exemplo:
     * `{"confirmedOptionId":"…","dayKey":"2026-10-03"}`.
     */
    expected: jsonb("expected").$type<Record<string, unknown>>(),
    status: notificationIntentStatus("status").notNull().default("pending"),
    workflowRunId: text("workflow_run_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastErrorCode: text("last_error_code"),
  },
  (table) => [
    /* A chave do debounce, e o `where` é a parte que importa: o único vale só
       enquanto a intent está **aberta**. Quatro datas sugeridas dentro da
       janela colidem e viram uma; depois que aquela foi enviada ou suprimida, a
       próxima sugestão pode abrir outra com a mesma chave.

       Um único total aqui seria um bug silencioso: o primeiro "quero muito" de
       um plano impediria para sempre o segundo. */
    uniqueIndex("notification_intents_open_dedupe_idx")
      .on(table.workspaceId, table.recipientProfileId, table.dedupeKey)
      .where(sql`${table.status} in ('pending', 'processing')`),
    /* O índice do recovery: "pendentes que já venceram" é a única consulta que
       roda sem contexto de usuário e precisa ser barata. */
    index("notification_intents_due_idx").on(table.status, table.dueAt),
    index("notification_intents_recipient_idx").on(
      table.workspaceId,
      table.recipientProfileId,
    ),
    index("notification_intents_plan_idx").on(table.planId),
  ],
);

/**
 * Uma linha por (intent, subscription). O único é o que torna o envio
 * idempotente: se um step do Workflow repetir, o insert colide e a segunda
 * tentativa não vira segunda notificação no telefone da pessoa.
 */
export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    intentId: uuid("intent_id")
      .notNull()
      .references(() => notificationIntents.id, { onDelete: "cascade" }),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => pushSubscriptions.id, { onDelete: "cascade" }),
    status: notificationDeliveryStatus("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastStatusCode: integer("last_status_code"),
    lastErrorCode: text("last_error_code"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("notification_deliveries_unique").on(
      table.intentId,
      table.subscriptionId,
    ),
    index("notification_deliveries_intent_idx").on(table.intentId),
  ],
);
