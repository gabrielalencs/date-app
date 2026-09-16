import type { NotificationKind } from "@/features/notifications/kinds";
import type { PlanStatus } from "@/lib/status";

/**
 * A revalidação: o coração do bloco (seção 1 do docs/NOTIFICATIONS.md).
 *
 * A intent guarda o que era verdade quando a pessoa clicou. Isto aqui recebe o
 * que é verdade **agora** e responde se a afirmação sobrevive. Função pura: o
 * workflow busca os fatos, esta função decide, e a decisão inteira cabe num
 * teste sem banco.
 *
 * `suppressed` não é falha. É o produto funcionando: alguém clicou, mudou de
 * ideia dentro do prazo, e o telefone da outra pessoa não mentiu.
 */

export type PlanFacts = {
  exists: boolean;
  title: string;
  status: PlanStatus;
  archived: boolean;
  /** Opção confirmada agora — não a que estava confirmada no clique. */
  confirmedOptionId: string | null;
  confirmedDayKey: string | null;
  confirmedStartsAt: Date | null;
  reservationStatus: "pending" | "confirmed" | "cancelled" | null;
  /** A reação `want_a_lot` do ator ainda existe? */
  actorWantsALot: boolean;
  /** Quantas opções de data do ator sobreviveram. */
  actorOpenOptionCount: number;
  /** Voto final do ator na opção esperada, ou null se retirado. */
  actorVote: "yes" | "maybe" | "no" | null;
  /** A primeira avaliação do ator ainda existe? */
  actorRatingExists: boolean;
};

export type Expected = {
  confirmedOptionId?: string;
  dayKey?: string;
  optionId?: string;
  reservationStatus?: "pending" | "confirmed" | "cancelled";
  vote?: "yes" | "maybe" | "no";
  offsetDays?: number;
};

export type Verdict = { send: true } | { send: false; reason: string };

const OK: Verdict = { send: true };

function no(reason: string): Verdict {
  return { send: false, reason };
}

/**
 * Regras comuns a tudo que fala sobre um plano: se o plano sumiu ou foi
 * arquivado, nenhuma notificação sobre ele faz sentido.
 *
 * A exceção é o próprio arquivamento, que precisa do plano arquivado para
 * continuar verdadeiro — daí ele ser tratado antes, no `switch`.
 */
function planoUtilizavel(facts: PlanFacts): Verdict {
  if (!facts.exists) return no("plano não existe mais");
  if (facts.archived) return no("plano foi arquivado");
  return OK;
}

export function shouldSend(
  kind: NotificationKind,
  expected: Expected,
  facts: PlanFacts,
): Verdict {
  /* Arquivamento e cancelamento afirmam justamente o estado que faria as
     outras regras barrarem, então vêm primeiro. */
  if (kind === "plan_archived") {
    if (!facts.exists) return no("plano não existe mais");
    return facts.archived ? OK : no("plano foi desarquivado antes do prazo");
  }

  if (kind === "plan_cancelled") {
    if (!facts.exists) return no("plano não existe mais");
    return facts.status === "cancelled"
      ? OK
      : no(`plano saiu de cancelled para ${facts.status}`);
  }

  const base = planoUtilizavel(facts);
  if (!base.send) return base;

  switch (kind) {
    case "plan_created":
      /* O plano existe e está ativo — o `planoUtilizavel` acima já provou. Um
         plano criado e cancelado dentro dos 15 minutos não vira "nova ideia". */
      return facts.status === "cancelled"
        ? no("plano foi cancelado antes do prazo")
        : OK;

    case "want_a_lot":
      return facts.actorWantsALot
        ? OK
        : no("a reação foi retirada antes do prazo");

    case "date_suggested":
      return facts.actorOpenOptionCount > 0
        ? OK
        : no("as datas sugeridas foram apagadas");

    case "vote_cast": {
      if (facts.actorVote === null) return no("o voto foi retirado");
      /* O estado final é o que vale: sim → talvez → sim atualiza a mesma intent
         e o que sai é o último. Se o `expected` ficou para trás, quem manda é o
         banco, não o que a intent lembrava. */
      return facts.actorVote === expected.vote
        ? OK
        : no(`voto mudou de ${expected.vote} para ${facts.actorVote}`);
    }

    case "date_confirmed": {
      if (facts.confirmedOptionId === null) {
        return no("a data foi desconfirmada");
      }
      if (facts.confirmedOptionId !== expected.confirmedOptionId) {
        return no("outra data foi confirmada no lugar");
      }
      if (facts.confirmedDayKey !== expected.dayKey) {
        return no("a data confirmada mudou de dia");
      }
      /* `planned` ou `reserved`: o produto afirma "está planejado", e reservar
         não desmente isso. Qualquer outro status desmente. */
      return facts.status === "planned" || facts.status === "reserved"
        ? OK
        : no(`status incompatível: ${facts.status}`);
    }

    case "booking_updated":
      return facts.reservationStatus === expected.reservationStatus
        ? OK
        : no(
            `reserva mudou de ${expected.reservationStatus} para ${facts.reservationStatus}`,
          );

    case "plan_completed":
      return facts.status === "completed"
        ? OK
        : no(`plano não está mais completed: ${facts.status}`);

    case "memory_added":
      return facts.actorRatingExists
        ? OK
        : no("a avaliação foi retirada antes do prazo");

    case "date_reminder": {
      if (facts.confirmedOptionId === null) {
        return no("não há mais data confirmada");
      }
      if (facts.confirmedOptionId !== expected.confirmedOptionId) {
        return no("outra data foi confirmada no lugar");
      }
      if (facts.confirmedDayKey !== expected.dayKey) {
        return no("a data confirmada mudou de dia");
      }
      /* Lembrar de um date que já aconteceu, foi cancelado ou virou memória é
         pior que não lembrar de nada. */
      if (facts.status === "completed" || facts.status === "cancelled") {
        return no(`plano está ${facts.status}`);
      }
      return OK;
    }

    default: {
      const inalcancavel: never = kind;
      throw new Error(`Kind sem revalidação: ${String(inalcancavel)}`);
    }
  }
}
