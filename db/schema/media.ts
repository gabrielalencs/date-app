import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import { mediaPurpose, reactionType } from "./enums.ts";
import { profiles, workspaces } from "./identity.ts";
import { plans } from "./plans.ts";

/**
 * `object_key` é sempre gerado pelo servidor e nunca aceito do cliente.
 * Formato: {workspace_id}/{plan_id}/{uuid}/full.webp
 *
 * Cada foto tem duas saídas. `object_key` guarda a do `full`; `thumb_object_key`
 * guarda a da miniatura (D-054). Coluna própria em vez de chave derivada por
 * convenção de string: a linha só nasce depois de os dois objetos existirem no
 * R2, então NOT NULL é o invariante real e o banco é quem o garante.
 *
 * O unique global de `object_key` cobre os dois: as duas chaves compartilham o
 * segmento uuid, então thumb duplicado implicaria full duplicado, que já é
 * impossível.
 *
 * **Vídeo** (D-184) é a mesma linha: `mime_type = 'video/mp4'`, `object_key`
 * terminando em `full.mp4`, o `thumb` sendo o pôster em WebP, e `duration_ms`
 * preenchido. Duração existe se e somente se a linha é vídeo — foto com
 * duração ou vídeo sem ela são estados impossíveis, e estado impossível vive
 * no banco (D-065).
 */
export const media = pgTable(
  "media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    objectKey: text("object_key").notNull(),
    thumbObjectKey: text("thumb_object_key").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    width: integer("width"),
    height: integer("height"),
    /** Só vídeo. Declarada pelo cliente, como largura e altura. */
    durationMs: integer("duration_ms"),
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
    check(
      "media_duration_positive",
      sql`${table.durationMs} is null or ${table.durationMs} > 0`,
    ),
    check(
      "media_duration_iff_video",
      sql`(${table.mimeType} like 'video/%') = (${table.durationMs} is not null)`,
    ),
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
    /* Uma opinião por pessoa por plano, garantido pelo banco.
 
       O unique acima permite que a mesma pessoa tenha "Amei" e "Não curti" no
       mesmo plano: são tipos diferentes. Para a opinião isso é um estado
       impossível, e estado impossível é invariante de correção — o lugar dele é
       aqui, não numa condição da mutation. O parcial deixa `favorite` de fora,
       que é o outro eixo e convive com qualquer opinião. */
    uniqueIndex("reactions_one_opinion_per_plan_profile")
      .on(table.planId, table.profileId)
      .where(sql`${table.type} <> 'favorite'`),
    index("reactions_workspace_id_idx").on(table.workspaceId),
    index("reactions_plan_id_idx").on(table.planId),
    index("reactions_profile_id_idx").on(table.profileId),
  ],
);
