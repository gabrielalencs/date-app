import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { reservationStatus } from "./enums.ts";
import { profiles, workspaces } from "./identity.ts";
import { plans } from "./plans.ts";

/**
 * Reserva do plano (B8). Uma por plano, garantido pelo banco.
 *
 * `plans.requires_booking` diz se o plano precisa de reserva; esta tabela é a
 * reserva em si, e só existe quando alguém começou a tratá-la.
 */
export const reservations = pgTable(
  "reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    status: reservationStatus("status").notNull().default("pending"),
    /** O localizador, o número da mesa, o que o lugar mandou. */
    code: text("code"),
    /**
     * Hora de parede, sem dia e sem fuso — "20:30", que é o que o restaurante
     * disse.
     *
     * O dia da reserva **é** o dia da data confirmada, por construção: reserva
     * exige data confirmada. Guardar um `timestamptz` duplicaria o dia em dois
     * lugares, e dois lugares divergem — bastaria a data confirmada mudar para
     * a reserva exibir um dia que contradiz o plano, em silêncio.
     */
    reservedTime: time("reserved_time"),
    url: text("url"),
    notes: text("notes"),
    createdBy: text("created_by")
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    /* Uma reserva por plano: duas reservas para o mesmo date é estado
       impossível, e estado impossível vive no banco (D-065). */
    uniqueIndex("reservations_plan_id_unique").on(table.planId),
    index("reservations_workspace_id_idx").on(table.workspaceId),
  ],
);

export const checklistItems = pgTable(
  "checklist_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    position: integer("position").notNull().default(0),
    doneAt: timestamp("done_at", { withTimezone: true }),
    doneBy: text("done_by").references(() => profiles.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    /* done_at e done_by andam juntos: ou os dois nulos, ou os dois preenchidos. */
    check(
      "checklist_items_done_together",
      sql`(${table.doneAt} is null and ${table.doneBy} is null) or (${table.doneAt} is not null and ${table.doneBy} is not null)`,
    ),
    index("checklist_items_workspace_id_idx").on(table.workspaceId),
    index("checklist_items_plan_id_idx").on(table.planId),
    index("checklist_items_plan_position_idx").on(table.planId, table.position),
    index("checklist_items_done_by_idx").on(table.doneBy),
  ],
);

/** Gasto real. O orçamento estimado mora em `plans`. Não existe divisão de conta. */
export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    /** Inteiro de centavos, BRL fixo (D-025). */
    amountCents: integer("amount_cents").notNull(),
    paidBy: text("paid_by").references(() => profiles.id, {
      onDelete: "set null",
    }),
    spentOn: date("spent_on"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    /* Gasto negativo não existe neste produto. O banco é a garantia; o Zod é a
       mensagem — quem digita "-10" precisa ler algo melhor que erro de driver. */
    check("expenses_amount_not_negative", sql`${table.amountCents} >= 0`),
    index("expenses_workspace_id_idx").on(table.workspaceId),
    index("expenses_plan_id_idx").on(table.planId),
    index("expenses_paid_by_idx").on(table.paidBy),
  ],
);
