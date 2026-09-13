import Link from "next/link";
import { Camera } from "lucide-react";

import { CategoryArt } from "@/components/brand/category-art";
import { MediaImage } from "@/features/media/components/media-image";
import type { MemoryCard as MemoryCardData } from "@/features/memories/data/queries";
import { formatDateTime } from "@/lib/datetime";
import { formatTenths } from "@/lib/rating";

/**
 * Um date que aconteceu.
 *
 * Fotografia é a protagonista, e esta é a tela onde isso é literal: a foto
 * ocupa o card inteiro e o texto é o mínimo — título, dia e cidade (seção 9 do
 * docs/MEMORIES.md).
 *
 * Plano realizado **sem** foto continua com a capa tipográfica (D-041). É
 * estado definitivo, não espera: ninguém vai voltar para subir a foto de um
 * date de dois anos atrás, e um retângulo cinza dizendo "sem imagem" seria pior
 * do que a arte de categoria.
 */
export function MemoryCard({
  memory,
  now,
  priority,
}: {
  memory: MemoryCardData;
  now: Date;
  /** A primeira da primeira página carrega antes: é o que aparece na dobra. */
  priority?: boolean;
}) {
  const lugar = memory.city ?? memory.placeName;

  return (
    <li className="min-w-0">
      <Link
        href={`/planos/${memory.planId}`}
        className="group flex min-w-0 flex-col gap-3 rounded-lg"
      >
        <div className="border-border-subtle relative aspect-4/5 w-full overflow-hidden rounded-lg border sm:aspect-square">
          {memory.coverMediaId ? (
            <MediaImage
              mediaId={memory.coverMediaId}
              alt={`Foto de ${memory.title}`}
              variant="thumb"
              priority={priority}
              sizes="(min-width: 1280px) 20rem, (min-width: 640px) 45vw, 92vw"
            />
          ) : (
            <CategoryArt category={memory.category} className="h-full" />
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="type-body-s text-text font-medium break-words">
            {memory.title}
          </h3>

          <p className="type-meta text-text-muted break-words">
            {formatDateTime(memory.happenedAt, { allDay: true, now })}
            {lugar ? ` · ${lugar}` : ""}
          </p>

          {/* Meta discreta, e só o que é verdade: a média exige as duas
              avaliações (seção 4), e a contagem de fotos só existe se houver
              foto. Nada de "0 fotos" nem de "sem avaliação". */}
          {memory.averageTenths !== null || memory.photoCount > 0 ? (
            <p className="type-meta text-text-muted tnum flex items-center gap-2">
              {memory.averageTenths !== null ? (
                <span>{formatTenths(memory.averageTenths)} de 5</span>
              ) : null}
              {memory.photoCount > 0 ? (
                <span className="flex items-center gap-1">
                  <Camera
                    aria-hidden="true"
                    className="size-3.5"
                    strokeWidth={1.6}
                  />
                  {memory.photoCount}
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
      </Link>
    </li>
  );
}
