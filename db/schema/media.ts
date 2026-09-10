import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import { mediaPurpose, reactionType } from "./enums.ts";
import { profiles, workspaces } from "./identity.ts";
import { plans } from "./plans.ts";

/**
 * `object_key` é sempre gerado pelo servidor e nunca aceito do cliente.
 * Formato: {workspace_id}/{plan_id|misc}/{uuid}.{ext}
 */
export const media = pgTable(
  "media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    objectKey: text("object_key").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    width: integer("width"),
    height: integer("height"),
    purpose: mediaPurpose("purpose").notNull(),
    // Ciclo media <-> plans resolvido pelo callback lazy do references.
    planId: uuid("plan_id").references((): AnyPgColumn => plans.id, {
      onDelete: "cascade",
    }),
    position: integer("position").notNull().default(0),
    uploadedBy: text("uploaded_by")
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("media_object_key_unique").on(table.objectKey),
    index("media_workspace_id_idx").on(table.workspaceId),
    index("media_plan_id_idx").on(table.planId),
    index("media_uploaded_by_idx").on(table.uploadedBy),
  ],
);

export const reactions = pgTable(
  "reactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    type: reactionType("type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("reactions_plan_profile_type_unique").on(
      table.planId,
      table.profileId,
      table.type,
    ),
    index("reactions_workspace_id_idx").on(table.workspaceId),
    index("reactions_plan_id_idx").on(table.planId),
    index("reactions_profile_id_idx").on(table.profileId),
  ],
);
