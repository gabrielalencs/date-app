import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { profiles, workspaces } from "./identity.ts";
import { plans } from "./plans.ts";

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
    index("expenses_workspace_id_idx").on(table.workspaceId),
    index("expenses_plan_id_idx").on(table.planId),
    index("expenses_paid_by_idx").on(table.paidBy),
  ],
);
