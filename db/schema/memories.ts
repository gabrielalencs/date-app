import { sql } from "drizzle-orm";
import {
  check,
  index,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { activityVerb, repeatAnswer } from "./enums.ts";
import { profiles, workspaces } from "./identity.ts";
import { plans } from "./plans.ts";

/** Uma memória por plano, existindo só depois de `completed`. */
export const memories = pgTable(
  "memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    highlight: text("highlight"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("memories_plan_id_unique").on(table.planId),
    index("memories_workspace_id_idx").on(table.workspaceId),
  ],
);

/**
 * Tabela separada porque são duas pessoas avaliando de forma independente;
 * colar isso em rating_user_a/rating_user_b travaria a V2.
 */
export const memoryRatings = pgTable(
  "memory_ratings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    memoryId: uuid("memory_id")
      .notNull()
      .references(() => memories.id, { onDelete: "cascade" }),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    rating: smallint("rating").notNull(),
    wouldRepeat: repeatAnswer("would_repeat"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("memory_ratings_rating_range", sql`${table.rating} between 1 and 5`),
    unique("memory_ratings_memory_profile_unique").on(
      table.memoryId,
      table.profileId,
    ),
    index("memory_ratings_workspace_id_idx").on(table.workspaceId),
    index("memory_ratings_memory_id_idx").on(table.memoryId),
    index("memory_ratings_profile_id_idx").on(table.profileId),
  ],
);

/**
 * Append-only: sem update, sem delete e sem FK para o sujeito — o evento
 * sobrevive ao plano apagado.
 */
export const activityEvents = pgTable(
  "activity_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    actorProfileId: text("actor_profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    verb: activityVerb("verb").notNull(),
    subjectType: text("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("activity_events_workspace_id_idx").on(table.workspaceId),
    index("activity_events_workspace_created_at_idx").on(
      table.workspaceId,
      table.createdAt.desc(),
    ),
    index("activity_events_actor_profile_id_idx").on(table.actorProfileId),
  ],
);
