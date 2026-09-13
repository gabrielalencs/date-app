import { Sparkles } from "lucide-react";

import type { PlanPhoto } from "@/features/media/data/queries";
import { MemoryNotesForm } from "@/features/memories/components/memory-notes-form";
import { MemoryPhotos } from "@/features/memories/components/memory-photos";
import { RatingControl } from "@/features/memories/components/rating-control";
import {
  RepeatAnswerText,
  RepeatControl,
} from "@/features/memories/components/repeat-control";
import type { PlanMemory } from "@/features/memories/data/queries";
import { formatCents } from "@/lib/money";
import { formatTenths, type MemberRating } from "@/lib/rating";

/**
 * "Como foi?" — a seção que só existe depois de o date ter acontecido.
 *
 * `completed` é terminal na **transição**, não na escrita: é aqui que metade do
 * B9 começa a funcionar (seção 3 do docs/MEMORIES.md). Plano cancelado ou
 * arquivado é leitura, como no B8 (D-098).
 */
export function PlanMemorySection({
  planId,
  planTitle,
  memory,
  photos,
  coverMediaId,
  totalSpentCents,
  viewerProfileId,
  readOnly,
}: {
  planId: string;
  planTitle: string;
  memory: PlanMemory;
  /** Já filtradas por `purpose = 'memory'` pela página. */
  photos: readonly PlanPhoto[];
  coverMediaId: string | null;
  /** `null` quando ninguém lançou gasto nenhum: zero seria outra afirmação. */
  totalSpentCents: number | null;
  viewerProfileId: string;
  readOnly: boolean;
}) {
  const { ratings, averageTenths } = memory;

  return (
    <section className="panel flex flex-col gap-6" aria-label="Como foi">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="section-heading flex items-center gap-3">
          <Sparkles aria-hidden="true" className="size-5" strokeWidth={1.5} />
          Como foi?
        </h2>

        {/* A média só aparece quando as duas avaliaram. Com uma pessoa só não
            existe média — existe a nota daquela pessoa, e mostrar "4,0" com
            metade do casal em silêncio é uma mentira pequena que o bloco de
            estatísticas depois amplifica (seção 4). */}
        {averageTenths === null ? null : (
          <span className="type-meta text-text-muted tnum">
            Média {formatTenths(averageTenths)} de 5
          </span>
        )}
      </div>

      <ul className="border-border-subtle grid grid-cols-1 gap-6 border-y py-6 sm:grid-cols-2">
        {ratings.map((avaliacao) => (
          <li key={avaliacao.profileId} className="flex flex-col gap-3">
            <PersonRating
              planId={planId}
              rating={avaliacao}
              editable={!readOnly && avaliacao.profileId === viewerProfileId}
            />
          </li>
        ))}
      </ul>

      <MemoryPhotos
        planId={planId}
        planTitle={planTitle}
        photos={photos}
        coverMediaId={coverMediaId}
        readOnly={readOnly}
      />

      {totalSpentCents === null ? null : (
        <p className="type-body-s text-text-muted">
          Custou{" "}
          <strong className="text-text tnum font-medium">
            {formatCents(totalSpentCents)}
          </strong>
          .
        </p>
      )}

      {readOnly ? (
        <ReadOnlyText memory={memory} />
      ) : (
        <MemoryNotesForm
          planId={planId}
          highlight={memory.memory?.highlight ?? null}
          notes={memory.memory?.notes ?? null}
        />
      )}
    </section>
  );
}

/**
 * Uma pessoa. As duas aparecem sempre, e quem não avaliou aparece como não
 * tendo avaliado — nunca como zero (D-062).
 */
function PersonRating({
  planId,
  rating,
  editable,
}: {
  planId: string;
  rating: MemberRating;
  editable: boolean;
}) {
  return (
    <>
      <span className="type-body-s text-text font-medium">
        {rating.displayName}
      </span>

      <RatingControl
        planId={planId}
        personName={rating.displayName}
        rating={rating.rating}
        editable={editable}
      />

      {/* "Repetiria?" depende da nota existir: `rating` é NOT NULL no banco
          desde o B2, e resposta sem nota seria avaliação pela metade. */}
      {rating.rating === null ? null : editable ? (
        <RepeatControl planId={planId} answer={rating.wouldRepeat} />
      ) : (
        <RepeatAnswerText
          answer={rating.wouldRepeat}
          personName={rating.displayName}
        />
      )}
    </>
  );
}

function ReadOnlyText({ memory }: { memory: PlanMemory }) {
  const { highlight, notes } = memory.memory ?? {
    highlight: null,
    notes: null,
  };

  if (!highlight && !notes) return null;

  return (
    <div className="flex flex-col gap-3">
      {highlight ? (
        <div className="flex flex-col gap-1">
          <span className="type-meta text-text-muted">A melhor parte</span>
          <p className="type-body-s break-words whitespace-pre-line">
            {highlight}
          </p>
        </div>
      ) : null}
      {notes ? (
        <div className="flex flex-col gap-1">
          <span className="type-meta text-text-muted">Observações</span>
          <p className="type-body-s text-text-muted break-words whitespace-pre-line">
            {notes}
          </p>
        </div>
      ) : null}
    </div>
  );
}
