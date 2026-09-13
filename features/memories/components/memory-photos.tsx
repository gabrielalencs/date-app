import { MediaImage } from "@/features/media/components/media-image";
import { PhotoActions } from "@/features/media/components/photo-actions";
import { PhotoPicker } from "@/features/media/components/photo-picker";
import type { PlanPhoto } from "@/features/media/data/queries";

/**
 * As fotos que as duas pessoas tiraram — `purpose = 'memory'`.
 *
 * **Nada do B5 é reescrito.** Mesmo upload assinado, mesmo reprocessamento no
 * cliente que descarta o EXIF, mesma rota autenticada de leitura, mesma remoção
 * que apaga a linha antes do objeto. O que muda é o propósito e onde a grade
 * aparece (seção 5 do docs/MEMORIES.md).
 *
 * Sem setas: a ordem é a ordem em que as fotos foram tiradas. Com "usar como
 * capa", que é o momento em que o card de `/memorias` deixa de mostrar a foto
 * do site do restaurante e passa a mostrar a que vocês tiraram lá.
 */
export function MemoryPhotos({
  planId,
  planTitle,
  photos,
  coverMediaId,
  readOnly,
}: {
  planId: string;
  planTitle: string;
  photos: readonly PlanPhoto[];
  coverMediaId: string | null;
  readOnly: boolean;
}) {
  if (readOnly && photos.length === 0) return null;

  return (
    <section className="flex flex-col gap-4" aria-label="Fotos do date">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="type-label text-text-muted">Fotos do date</h3>
        {readOnly ? null : (
          <PhotoPicker
            planId={planId}
            purpose="memory"
            label="Adicionar foto"
          />
        )}
      </div>

      {photos.length === 0 ? (
        <p className="type-body-s text-text-muted">
          Nenhuma foto do date ainda.
        </p>
      ) : (
        /* Uma coluna no celular: quatro alvos de 44px não cabem em meia largura
           de 320px, e encolher o alvo não é opção. Foto grande no telefone
           também é o que o design system pede. */
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {photos.map((photo) => (
            <li key={photo.id} className="flex flex-col gap-2">
              <div className="border-border-subtle relative aspect-square w-full overflow-hidden rounded-md border">
                <MediaImage
                  mediaId={photo.id}
                  alt={`Foto de ${planTitle}`}
                  variant="thumb"
                  sizes="(min-width: 1024px) 14rem, (min-width: 640px) 45vw, 92vw"
                />
              </div>
              {readOnly ? null : (
                <PhotoActions
                  planId={planId}
                  mediaId={photo.id}
                  isCover={photo.id === coverMediaId}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
