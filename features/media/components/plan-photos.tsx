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

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="section-heading">{title}</h2>
        {readOnly ? null : (
          <PhotoPicker
            planId={planId}
            purpose={uploadPurpose ?? (coverMediaId ? "gallery" : "cover")}
            label={
              addLabel ??
              (photos.length > 0 ? "Adicionar foto" : "Adicionar capa")
            }
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
      ) : (
        /* Uma grade só, com todas as fotos do mesmo tamanho.
 
           Antes a capa era tirada da grade e desenhada à parte, com legenda
           própria. Só que a página já mostra a capa grande no topo, e por isso
           as duas chamadas passavam `showCover={false}` — o ramo do herói aqui
           dentro nunca rodou. O efeito era a capa virar uma linha de botões sem
           imagem nenhuma: subir a primeira foto de um plano produzia um bloco
           "CAPA ★ ← → 🗑" flutuando sozinho, e a foto só aparecia quando uma
           segunda entrava na galeria.
 
           Com todas no mesmo lugar, a primeira foto aparece assim que sobe, e
           trocar a capa é tocar a estrela de qualquer uma — que era a outra
           pergunta sem resposta ("e se eu quiser mudar?"). */
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((photo) => {
            const ehCapa = photo.id === coverMediaId;

            return (
              <li key={photo.id} className="flex flex-col gap-2">
                <div className="border-border-subtle relative aspect-square w-full overflow-hidden rounded-md border">
                  <MediaImage
                    mediaId={photo.id}
                    alt={
                      ehCapa ? `Capa de ${planTitle}` : `Foto de ${planTitle}`
                    }
                    variant="thumb"
                    sizes="(min-width: 1024px) 12rem, (min-width: 640px) 30vw, 45vw"
                  />
                  {ehCapa ? (
                    <span className="bg-surface type-meta absolute top-2 left-2 rounded-full px-2.5 py-0.5">
                      Capa
                    </span>
                  ) : null}
                </div>
                {readOnly ? null : (
                  <PhotoActions
                    planId={planId}
                    mediaId={photo.id}
                    isCover={ehCapa}
                    showReorder={showReorder}
                    canMoveUp={visiveis.indexOf(photo.id) > 0}
                    canMoveDown={
                      visiveis.indexOf(photo.id) < visiveis.length - 1
                    }
                    onMove={(direction) => reordenar(photo.id, direction)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
