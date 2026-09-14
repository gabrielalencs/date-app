import Link from "next/link";
import { MapPin } from "lucide-react";

import { CategoryArt } from "@/components/brand/category-art";
import { MediaImage } from "@/features/media/components/media-image";
import type { MemoryEntry } from "@/features/memories/data/queries";
import { formatDay } from "@/lib/datetime";

/**
 * Um date realizado, na grade de `/memorias`.
 *
 * Fotografia é a protagonista, e esta é a tela onde isso é literal: foto
 * grande, e por card o mínimo — título, dia e cidade (seção 9). Nota e
 * contagem de fotos ficam de fora de propósito. Não é só economia de espaço:
 * cada uma delas custaria uma consulta por linha, e é exatamente isso que a
 * seção 7 proíbe.
 *
 * Plano realizado sem foto continua com a capa tipográfica (D-041). É estado
 * definitivo, não espera — e não se preenche com foto genérica de um lugar.
 */
export function MemoryCard({
  entry,
  now,
}: {
  entry: MemoryEntry;
  /** Vem da página, para o ano só aparecer quando não é o de agora. */
  now: Date;
}) {
  const local = entry.placeName ?? entry.city;

  return (
    <Link
      href={`/planos/${entry.planId}`}
      data-memory-card={entry.planId}
      className="border-border-subtle bg-surface group interactive-lift flex h-full min-w-0 flex-col overflow-hidden rounded-lg border"
    >
      {entry.coverMediaId ? (
        <div className="relative aspect-4/5 w-full overflow-hidden">
          <MediaImage
            mediaId={entry.coverMediaId}
            alt={entry.title}
            variant="thumb"
            sizes="(min-width: 1280px) 320px, (min-width: 640px) 40vw, 90vw"
            className="photo-zoom"
          />
        </div>
      ) : (
        <CategoryArt
          category={entry.category}
          title={entry.title}
          className="min-h-44 sm:aspect-4/3"
        />
      )}

      <div className="flex flex-1 flex-col gap-2 p-5">
        {entry.coverMediaId ? (
          <p className="font-display line-clamp-2 text-[1.4rem] leading-tight tracking-tight break-words">
            {entry.title}
          </p>
        ) : null}

        <p className="type-meta text-text-muted">
          {formatDay(entry.happenedAt, now)}
        </p>

        {local ? (
          <p className="type-meta text-text-muted flex items-center gap-2">
            <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="truncate">{local}</span>
          </p>
        ) : null}
      </div>
    </Link>
  );
}
