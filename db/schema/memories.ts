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

/**
 * A avaliação de uma pessoa sobre um date realizado.
 *
 * **Não existe tabela `memories`.** O B2 criou uma, com `highlight` e `notes`
 * dentro, e o `docs/MEMORIES.md` seção 4 põe os dois campos na avaliação de
 * cada pessoa — o que esvaziava aquela tabela de conteúdo próprio e a deixava
 * como junção pura entre `plans` e isto aqui. Ela foi removida no B9 (D-099).
 *
 * A tese da seção 1 é essa: memória não é entidade nova, é o plano depois. O
 * título, a data, o local, os gastos e as fotos continuam onde já estavam, e
 * o que o B9 acrescenta ao banco é uma linha por pessoa por plano.
 *
 * Tabela separada de `plans` porque são duas pessoas avaliando de forma
 * independente; colar isso em `rating_user_a`/`rating_user_b` travaria a V2.
 */
export const memoryRatings = pgTable(
  "memory_ratings",
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
    rating: smallint("rating").notNull(),
    wouldRepeat: repeatAnswer("would_repeat"),
    /** "Melhor parte", texto curto. */
    highlight: text("highlight"),
    /** Observações, texto livre. */
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    /* Nota fora de 1–5 é estado impossível, e estado impossível vive no banco
       (D-065). O Zod recusa antes, com uma frase; este CHECK é a garantia. */
    check("memory_ratings_rating_range", sql`${table.rating} between 1 and 5`),
    /* Uma avaliação por pessoa por plano, como manda a seção 10 — agora
       literalmente em (plan_id, profile_id), e não transitivamente. */
    unique("memory_ratings_plan_profile_unique").on(
      table.planId,
      table.profileId,
    ),
    index("memory_ratings_workspace_id_idx").on(table.workspaceId),
    index("memory_ratings_plan_id_idx").on(table.planId),
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
