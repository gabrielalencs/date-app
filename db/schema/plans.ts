import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import { linkType, planStatus, voteValue } from "./enums.ts";
import { profiles, workspaces } from "./identity.ts";
import { media } from "./media.ts";

export const plans = pgTable(
  "plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    category: text("category"),
    status: planStatus("status").notNull().default("idea"),
    priority: smallint("priority").notNull().default(0),
    // Ciclo plans <-> media resolvido pelo callback lazy do references.
    coverMediaId: uuid("cover_media_id").references(
      (): AnyPgColumn => media.id,
      { onDelete: "set null" },
    ),
    placeName: text("place_name"),
    address: text("address"),
    city: text("city"),
    state: text("state"),
    country: text("country"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    sourceUrl: text("source_url"),
    estimatedBudgetCents: integer("estimated_budget_cents"),
    durationMinutes: integer("duration_minutes"),
    requiresBooking: boolean("requires_booking").notNull().default(false),
    notes: text("notes"),
    /** Ocultação. `cancelled` é status e não se confunde com isto. */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
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
    check("plans_priority_range", sql`${table.priority} between 0 and 3`),
    index("plans_workspace_id_idx").on(table.workspaceId),
    index("plans_workspace_status_idx").on(table.workspaceId, table.status),
    index("plans_workspace_created_at_idx").on(
      table.workspaceId,
      table.createdAt.desc(),
    ),
    index("plans_cover_media_id_idx").on(table.coverMediaId),
    index("plans_created_by_idx").on(table.createdBy),
  ],
);

export const planLinks = pgTable(
  "plan_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    type: linkType("type").notNull().default("other"),
    url: text("url").notNull(),
    label: text("label"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("plan_links_workspace_id_idx").on(table.workspaceId),
    index("plan_links_plan_id_idx").on(table.planId),
  ],
);

export const planDateOptions = pgTable(
  "plan_date_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    allDay: boolean("all_day").notNull().default(false),
    note: text("note"),
    isConfirmed: boolean("is_confirmed").notNull().default(false),
    createdBy: text("created_by")
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    /* No máximo uma data oficial por plano, garantido pelo banco em vez da
       aplicação. Evita FK circular entre plans e plan_date_options. */
    uniqueIndex("plan_date_options_one_confirmed_per_plan")
      .on(table.planId)
      .where(sql`${table.isConfirmed}`),
    index("plan_date_options_workspace_id_idx").on(table.workspaceId),
    index("plan_date_options_workspace_starts_at_idx").on(
      table.workspaceId,
      table.startsAt,
    ),
    index("plan_date_options_plan_id_idx").on(table.planId),
    index("plan_date_options_created_by_idx").on(table.createdBy),
  ],
);

export const planDateVotes = pgTable(
  "plan_date_votes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    optionId: uuid("option_id")
      .notNull()
      .references(() => planDateOptions.id, { onDelete: "cascade" }),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    vote: voteValue("vote").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("plan_date_votes_option_profile_unique").on(
      table.optionId,
      table.profileId,
    ),
    index("plan_date_votes_workspace_id_idx").on(table.workspaceId),
    index("plan_date_votes_option_id_idx").on(table.optionId),
    index("plan_date_votes_profile_id_idx").on(table.profileId),
  ],
);
