import { Star } from "lucide-react";

import { MemoryNotesForm } from "@/features/memories/components/memory-notes-form";
import { RatingControl } from "@/features/memories/components/rating-control";
import { RepeatControl } from "@/features/memories/components/repeat-control";
import type { PlanRatings } from "@/features/memories/data/queries";
import { cn } from "@/lib/cn";
import {
  formatAverage,
  pendingLabel,
  ratingOptionLabel,
  REPEAT_SUMMARY,
  type MemberRating,
} from "@/lib/rating";

/**
 * "Como foi?" — a seção que aparece no detalhe depois que o date é marcado
 * como realizado (seção 9 do docs/MEMORIES.md).
 *
 * As duas avaliações são **sempre visíveis**. Esconder até avaliar evitaria
 * ancoragem, e de novo a transparência é o produto (D-062) — é a mesma decisão
 * que o B6 tomou sobre os votos, e este bloco não a reinventa.
 *
 * Não avaliar é estado distinto de dar nota baixa: a ausência aparece como
 * "Alex ainda não avaliou", nunca como zero nem como estrelas vazias que
 * parecem nota 0.
 *
 * Server Component: o que é interativo são os três controles, cada um cliente
 * por conta própria.
 */
export function PlanReview({
  planId,
  ratings,
}: {
  planId: string;
  ratings: PlanRatings;
}) {
  const { members, summary, mine } = ratings;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="section-heading">Como foi?</h2>

        {/* Com uma pessoa só, não existe média — existe a nota daquela pessoa.
            Mostrar "4,0" com metade do casal calada é uma mentira pequena que
            o bloco de estatísticas depois amplifica (seção 4). */}
        {summary.average === null ? null : (
          <p
            className="type-meta text-text-muted tnum"
            data-rating-average={formatAverage(summary.average)}
          >
            Média de vocês dois:{" "}
            <span className="text-text">{formatAverage(summary.average)}</span>{" "}
            de 5
          </p>
        )}
      </div>

      <ul className="border-border-subtle grid gap-5 border-y py-5 sm:grid-cols-2">
        {members.map((member) => (
          <li key={member.profileId}>
            <RatingReadout member={member} />
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-5">
        <RatingControl
          planId={planId}
          value={mine?.rating ?? null}
          hasNotes={Boolean(mine?.highlight ?? mine?.notes)}
        />

        {/* Repetiria e os textos moram na mesma linha da nota, que é NOT NULL:
            sem nota não há linha onde gravá-los. */}
        {mine?.rating ? (
          <>
            <RepeatControl planId={planId} value={mine.wouldRepeat} />
            <MemoryNotesForm
              planId={planId}
              highlight={mine.highlight}
              notes={mine.notes}
            />
          </>
        ) : null}
      </div>
    </section>
  );
}

/** A avaliação de uma pessoa, como ela aparece para as duas. */
function RatingReadout({ member }: { member: MemberRating }) {
  if (member.rating === null) {
    return (
      <div className="flex flex-col gap-1">
        <p className="type-body-s text-text">{member.displayName}</p>
        <p className="type-meta text-text-muted">
          {pendingLabel(member.displayName)}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="type-body-s text-text">{member.displayName}</p>

      <p className="flex items-center gap-1">
        <span className="sr-only">{ratingOptionLabel(member.rating)}</span>
        {[1, 2, 3, 4, 5].map((posicao) => {
          const cheia = posicao <= member.rating!;
          return (
            <Star
              key={posicao}
              aria-hidden="true"
              className={cn(
                "size-4",
                cheia ? "text-accent" : "text-text-muted",
              )}
              fill={cheia ? "currentColor" : "none"}
              strokeWidth={cheia ? 1 : 1.5}
            />
          );
        })}
      </p>

      {member.wouldRepeat ? (
        <p className="type-meta text-text-muted">
          {REPEAT_SUMMARY[member.wouldRepeat]}
        </p>
      ) : null}

      {member.highlight ? (
        <p className="type-body-s text-text break-words">
          “{member.highlight}”
        </p>
      ) : null}

      {member.notes ? (
        <p className="type-meta text-text-muted break-words whitespace-pre-line">
          {member.notes}
        </p>
      ) : null}
    </div>
  );
}
