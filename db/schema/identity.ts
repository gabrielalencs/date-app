import {
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import { memberRole } from "./enums.ts";
import { media } from "./media.ts";

/**
 * Espelha o id do usuário do Neon Auth sem FK entre schemas (D-023).
 * Não é tabela de negócio: identidade não é escopada por workspace.
 */
export const profiles = pgTable(
  "profiles",
  {
    id: text("id").primaryKey(),
    displayName: text("display_name").notNull(),
    // Ciclo profiles <-> media resolvido pelo callback lazy do references.
    avatarMediaId: uuid("avatar_media_id").references(
      (): AnyPgColumn => media.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("profiles_avatar_media_id_idx").on(table.avatarMediaId)],
);

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** É esta tabela que decide o acesso. Sessão sem linha aqui é 403. */
export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.profileId] }),
    // A PK composta já indexa workspace_id como prefixo; profile_id precisa do seu.
    index("workspace_members_profile_id_idx").on(table.profileId),
  ],
);
