import { z } from "zod";

import type {
  ActivityEntry,
  ActivityVerb,
} from "@/features/activity/data/queries";
import { formatDateTime } from "@/lib/datetime";

const isoDate = z.iso.datetime({ offset: true });

const suggestedMetadata = z.object({
  startsAt: isoDate,
  allDay: z.boolean().optional(),
});

const voteMetadata = z.object({
  vote: z.enum(["yes", "maybe", "no"]),
  startsAt: isoDate,
});

const voteOnlyMetadata = z.object({
  vote: z.enum(["yes", "maybe", "no"]),
});

const confirmedMetadata = z.object({ startsAt: isoDate });
const bookingMetadata = z.object({
  status: z.enum(["pending", "confirmed", "cancelled"]),
});

const VOTE_LABEL = {
  yes: "Sim",
  maybe: "Talvez",
  no: "Não",
} as const;

function eventDate(iso: string, allDay: boolean, now: Date): string {
  return formatDateTime(new Date(iso), { allDay, now });
}

function bookingText(metadata: unknown): string {
  const parsed = bookingMetadata.safeParse(metadata);
  if (!parsed.success) return "atualizou a reserva";

  switch (parsed.data.status) {
    case "confirmed":
      return "confirmou a reserva";
    case "pending":
      return "deixou a reserva pendente";
    case "cancelled":
      return "cancelou a reserva";
  }
}

/** O rótulo nasce agora; o banco guarda fatos, nunca texto de interface. */
export function activityText(
  event: Pick<ActivityEntry, "verb" | "metadata">,
  now: Date,
): string {
  switch (event.verb) {
    case "plan_created":
      return "criou este plano";
    case "date_suggested": {
      const parsed = suggestedMetadata.safeParse(event.metadata);
      return parsed.success
        ? `sugeriu ${eventDate(parsed.data.startsAt, parsed.data.allDay ?? false, now)}`
        : "sugeriu uma data";
    }
    case "vote_cast": {
      const parsed = voteMetadata.safeParse(event.metadata);
      if (parsed.success) {
        return `votou “${VOTE_LABEL[parsed.data.vote]}” em ${eventDate(parsed.data.startsAt, false, now)}`;
      }

      const voteOnly = voteOnlyMetadata.safeParse(event.metadata);
      return voteOnly.success
        ? `votou “${VOTE_LABEL[voteOnly.data.vote]}” em uma data`
        : "registrou um voto";
    }
    case "date_confirmed": {
      const parsed = confirmedMetadata.safeParse(event.metadata);
      return parsed.success
        ? `confirmou ${eventDate(parsed.data.startsAt, false, now)}`
        : "confirmou uma data";
    }
    case "booking_updated":
      return bookingText(event.metadata);
    case "plan_completed":
      return "marcou o DATE como realizado";
    case "memory_added":
      return "adicionou uma avaliação à memória";
    case "want_a_lot":
      return "marcou que quer muito este DATE";
  }
}

/** Garante exaustividade quando um novo verbo entrar no enum. */
export const ACTIVITY_VERBS: readonly ActivityVerb[] = [
  "plan_created",
  "date_suggested",
  "vote_cast",
  "date_confirmed",
  "booking_updated",
  "plan_completed",
  "memory_added",
  "want_a_lot",
];
