import { pgEnum } from "drizzle-orm/pg-core";

export const planStatus = pgEnum("plan_status", [
  "idea",
  "deciding",
  "planned",
  "reserved",
  "completed",
  "cancelled",
]);

export const voteValue = pgEnum("vote_value", ["yes", "maybe", "no"]);

// Tipo separado do vote_value de propósito: a seção 5 nomeia os dois.
export const repeatAnswer = pgEnum("repeat_answer", ["yes", "maybe", "no"]);

export const linkType = pgEnum("link_type", [
  "instagram",
  "tiktok",
  "website",
  "google_maps",
  "waze",
  "booking",
  "ticket",
  "lodging",
  "other",
]);

export const reactionType = pgEnum("reaction_type", ["favorite", "want_a_lot"]);

export const mediaPurpose = pgEnum("media_purpose", [
  "cover",
  "gallery",
  "memory",
  "avatar",
]);

export const memberRole = pgEnum("member_role", ["owner", "member"]);

/**
 * Estado da reserva (B8).
 *
 * `cancelled` cobre também "tentamos e não tinha vaga": é informação que muda a
 * decisão de data, e o lugar dela é o campo de observações, não um quarto
 * estado que ninguém saberia quando usar.
 */
export const reservationStatus = pgEnum("reservation_status", [
  "pending",
  "confirmed",
  "cancelled",
]);

export const activityVerb = pgEnum("activity_verb", [
  "plan_created",
  "date_suggested",
  "vote_cast",
  "date_confirmed",
  "booking_updated",
  "plan_completed",
  "memory_added",
  "want_a_lot",
]);

/**
 * Estados da intenção de notificação (B11.5, seção 5 do docs/NOTIFICATIONS.md).
 *
 * `suppressed` não é falha: é o bloco funcionando. Quer dizer que a hora chegou,
 * o servidor releu o estado e a afirmação que a intent carregava deixou de ser
 * verdade — plano arquivado, reação retirada, data trocada.
 */
export const notificationIntentStatus = pgEnum("notification_intent_status", [
  "pending",
  "processing",
  "sent",
  "suppressed",
  "cancelled",
  "failed",
]);

export const notificationDeliveryStatus = pgEnum(
  "notification_delivery_status",
  ["pending", "sent", "stale", "failed"],
);

/**
 * O lock screen é público para quem estiver perto da pessoa. `private` é o
 * default e não mostra título do date nem data; `full` é opt-in consciente.
 */
export const notificationPreviewMode = pgEnum("notification_preview_mode", [
  "private",
  "full",
]);
