"use client";

import { Camera } from "lucide-react";

import { MediaImage } from "@/features/media/components/media-image";
import { PhotoActions } from "@/features/media/components/photo-actions";
import { PhotoPicker } from "@/features/media/components/photo-picker";
import type { UploadablePurpose } from "@/features/media/constants";
import type { PlanPhoto } from "@/features/media/data/queries";

/**
 * Uma grade de fotos de um plano. Capa em destaque no topo, galeria em grade
 * 1/1 embaixo, como manda a seção 4 do design system.
 *
 * O B9 fez esta grade aparecer **duas vezes** na mesma página: "Fotos do plano"
 * mostra `cover` e `gallery` — a inspiração, o que fez vocês quererem ir —, e
 * "As fotos de vocês" mostra `memory`, o que foi fotografado lá. São a mesma
 * tabela e o mesmo fluxo; o que muda é o `purpose` e onde a grade aparece.
 *
 * Daí a separação entre `photos` e `allPhotos`. A action de reordenar exige a
 * ordem **completa** das fotos do plano e recusa qualquer lista que não
 * confira — então mover uma foto dentro de uma das grades troca a posição dela
 * com o vizinho **visível**, e a ordem completa é reconstituída depois,
 * deixando as fotos da outra grade exatamente onde estavam. Sem isso, mover uma
 * foto da galeria cujo vizinho por posição fosse uma foto de memória seria um
 * clique que grava e não muda nada na tela.
 *
 * Cliente por causa disso: o par de setas precisa conhecer as duas listas.
 */
export function PlanPhotos({
  planId,
  planTitle,
  photos,
  allPhotos,
  coverMediaId,
  showCover = true,
  showReorder = true,
  title = "Fotos do plano",
  uploadPurpose,
  addLabel,
  emptyText = "Nenhuma foto ainda. Adicione uma imagem que conte um pouco desse plano.",
  readOnly = false,
}: {
  planId: string;
  planTitle: string;
  /** As fotos desta grade, na ordem de exibição. */
  photos: readonly PlanPhoto[];
  /** Todas as fotos do plano, na ordem completa. Padrão: as desta grade. */
  allPhotos?: readonly PlanPhoto[];
  coverMediaId: string | null;
  showCover?: boolean;
  showReorder?: boolean;
  title?: string;
  /** `purpose` do que for enviado por esta grade. */
  uploadPurpose?: UploadablePurpose;
  addLabel?: string;
  emptyText?: string;
  readOnly?: boolean;
}) {
  const todas = (allPhotos ?? photos).map((photo) => photo.id);
  const visiveis = photos.map((photo) => photo.id);

  /**
   * Troca a foto com o vizinho **visível** e devolve a ordem completa.
   *
   * As posições ocupadas por fotos visíveis recebem a nova sequência; as demais
   * ficam onde estavam. A action revalida a lista inteira do lado do servidor.
   */
  function reordenar(id: string, direction: -1 | 1): string[] {
    const de = visiveis.indexOf(id);
    const para = de + direction;

    if (de === -1 || para < 0 || para >= visiveis.length) {
      return [...todas];
    }

    const nova = [...visiveis];
    const [movida] = nova.splice(de, 1);
    nova.splice(para, 0, movida!);

    const fila = [...nova];
    return todas.map((atual) =>
      visiveis.includes(atual) ? fila.shift()! : atual,
    );
  }

  const capa = photos.find((photo) => photo.id === coverMediaId) ?? null;
  const resto = photos.filter((photo) => photo.id !== capa?.id);

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="section-heading">{title}</h2>
        {readOnly ? null : (
          <PhotoPicker
            planId={planId}
            purpose={uploadPurpose ?? (capa ? "gallery" : "cover")}
            label={addLabel ?? (capa ? "Adicionar foto" : "Adicionar capa")}
          />
        )}
      </div>

      {photos.length === 0 ? (
        <div className="bg-sage-soft flex flex-col items-center gap-3 rounded-lg px-6 py-8 text-center">
          <Camera
            aria-hidden="true"
            className="text-text-muted size-6"
            strokeWidth={1.5}
          />
          <p className="type-body-s text-text-muted max-w-xs">{emptyText}</p>
        </div>
      ) : null}

      {capa ? (
        <figure className="flex flex-col gap-3">
          {showCover ? (
            <div className="border-border-subtle relative aspect-4/5 w-full overflow-hidden rounded-lg border sm:aspect-16/9">
              <MediaImage
                mediaId={capa.id}
                alt={`Capa de ${planTitle}`}
                priority
                sizes="(min-width: 1024px) 42rem, 100vw"
              />
            </div>
          ) : null}
          <figcaption className="flex flex-wrap items-center justify-between gap-2">
            <span className="type-label text-text-muted">Capa</span>
            {readOnly ? null : (
              <PhotoActions
                planId={planId}
                mediaId={capa.id}
                isCover
                showReorder={showReorder}
                canMoveUp={visiveis.indexOf(capa.id) > 0}
                canMoveDown={visiveis.indexOf(capa.id) < visiveis.length - 1}
                onMove={(direction) => reordenar(capa.id, direction)}
              />
            )}
          </figcaption>
        </figure>
      ) : null}

      {/* Galeria em uma coluna no celular: quatro alvos de 44px não cabem em
          meia largura de 320px, e encolher o alvo não é opção. Foto grande no
          telefone também é o que o design system pede. */}
      {resto.length > 0 ? (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {resto.map((photo) => (
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
                  isCover={false}
                  showReorder={showReorder}
                  canMoveUp={visiveis.indexOf(photo.id) > 0}
                  canMoveDown={visiveis.indexOf(photo.id) < visiveis.length - 1}
                  onMove={(direction) => reordenar(photo.id, direction)}
                />
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
