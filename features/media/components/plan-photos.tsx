"use client";

import { Camera } from "lucide-react";

import { MediaImage } from "@/features/media/components/media-image";
import { PhotoActions } from "@/features/media/components/photo-actions";
import { PhotoPicker } from "@/features/media/components/photo-picker";
import type { PlanPhoto } from "@/features/media/data/queries";

/**
 * Fotos de um plano. Capa em destaque no topo, galeria em grade 1/1 embaixo,
 * como manda a seção 4 do design system.
 *
 * Cliente por causa da reordenação: o par de setas precisa conhecer a lista
 * inteira para montar a nova ordem, e a action recusa qualquer lista que não
 * corresponda exatamente às fotos do plano.
 */
export function PlanPhotos({
  planId,
  planTitle,
  photos,
  coverMediaId,
}: {
  planId: string;
  planTitle: string;
  photos: readonly PlanPhoto[];
  coverMediaId: string | null;
}) {
  const ordem = photos.map((photo) => photo.id);

  function reordenar(id: string, direction: -1 | 1): string[] {
    const de = ordem.indexOf(id);
    const para = de + direction;

    if (de === -1 || para < 0 || para >= ordem.length) {
      return [...ordem];
    }

    const nova = [...ordem];
    const [movida] = nova.splice(de, 1);
    nova.splice(para, 0, movida!);
    return nova;
  }

  const capa = photos.find((photo) => photo.id === coverMediaId) ?? null;
  const resto = photos.filter((photo) => photo.id !== capa?.id);

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="type-label text-text-muted">Fotos</h2>
        <PhotoPicker
          planId={planId}
          purpose={capa ? "gallery" : "cover"}
          label={capa ? "Adicionar foto" : "Adicionar capa"}
        />
      </div>

      {photos.length === 0 ? (
        <div className="border-border-subtle bg-surface-sunken flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center">
          <Camera
            aria-hidden="true"
            className="text-text-muted size-6"
            strokeWidth={1.5}
          />
          <p className="type-body-s text-text-muted max-w-xs">
            Nenhuma foto ainda. A capa do card continua sendo o título até
            entrar a primeira.
          </p>
        </div>
      ) : null}

      {capa ? (
        <figure className="flex flex-col gap-3">
          <div className="border-border-subtle relative aspect-4/5 w-full overflow-hidden rounded-lg border sm:aspect-16/9">
            <MediaImage
              mediaId={capa.id}
              alt={`Capa de ${planTitle}`}
              priority
              sizes="(min-width: 1024px) 42rem, 100vw"
            />
          </div>
          <figcaption className="flex flex-wrap items-center justify-between gap-2">
            <span className="type-label text-text-muted">Capa</span>
            <PhotoActions
              planId={planId}
              mediaId={capa.id}
              isCover
              canMoveUp={ordem.indexOf(capa.id) > 0}
              canMoveDown={ordem.indexOf(capa.id) < ordem.length - 1}
              onMove={(direction) => reordenar(capa.id, direction)}
            />
          </figcaption>
        </figure>
      ) : null}

      {resto.length > 0 ? (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {resto.map((photo) => (
            <li key={photo.id} className="flex flex-col gap-2">
              <div className="border-border-subtle relative aspect-square w-full overflow-hidden rounded-md border">
                <MediaImage
                  mediaId={photo.id}
                  alt={`Foto de ${planTitle}`}
                  variant="thumb"
                  sizes="(min-width: 640px) 12rem, 45vw"
                />
              </div>
              <PhotoActions
                planId={planId}
                mediaId={photo.id}
                isCover={false}
                canMoveUp={ordem.indexOf(photo.id) > 0}
                canMoveDown={ordem.indexOf(photo.id) < ordem.length - 1}
                onMove={(direction) => reordenar(photo.id, direction)}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
