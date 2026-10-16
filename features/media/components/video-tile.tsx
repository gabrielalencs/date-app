"use client";

import { useCallback, useState } from "react";
import { Play } from "lucide-react";

import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { MediaImage } from "@/features/media/components/media-image";
import {
  formatClock,
  spokenDuration,
} from "@/features/media/video/trim-window";

/**
 * Um vídeo na Galeria (D-184).
 *
 * Na grade ele é o pôster — o primeiro quadro do trecho, em WebP, servido
 * como qualquer miniatura — com duas marcas por cima: o play no centro, que
 * diz o que é, e a duração no canto, que diz quanto é. As duas sobre um scrim
 * discreto, o único overlay que o design system admite sobre foto.
 *
 * Tocar abre o player numa gaveta, e não dentro do ladrilho: um vídeo num
 * quadrado de 160px no telefone, com os controles do navegador espremidos
 * em cima, não é assistir. O `<video>` só existe com a gaveta aberta — a grade
 * não baixa um byte de vídeo antes de alguém pedir.
 */
export function VideoPosterMarks({ durationMs }: { durationMs: number }) {
  return (
    <>
      <span
        aria-hidden="true"
        className="text-on-photo absolute top-1/2 left-1/2 grid size-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-[var(--photo-shade)]"
      >
        <Play className="ml-0.5 size-5" fill="currentColor" strokeWidth={1.5} />
      </span>
      <span
        aria-hidden="true"
        className="bg-surface type-meta tnum absolute bottom-2 left-2 rounded-full px-2.5 py-0.5"
      >
        {formatClock(durationMs / 1000)}
      </span>
    </>
  );
}

function prefereMenosMovimento(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function VideoTile({
  mediaId,
  planTitle,
  durationMs,
}: {
  mediaId: string;
  planTitle: string;
  durationMs: number;
}) {
  const [aberto, setAberto] = useState(false);

  /* Quem tocou no ladrilho pediu para assistir: o vídeo começa sozinho. Com
     `prefers-reduced-motion`, não — fica parado no pôster até a pessoa dar
     play. O toque que abriu a gaveta é o gesto que autoriza tocar com som. */
  const comecar = useCallback((video: HTMLVideoElement | null) => {
    if (video && !prefereMenosMovimento()) {
      void video.play().catch(() => {});
    }
  }, []);

  const duracao = spokenDuration(durationMs / 1000);

  return (
    <Sheet open={aberto} onOpenChange={setAberto}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label={`Assistir ao vídeo de ${planTitle}, ${duracao}`}
          /* O quadrado em volta corta o que passa da borda (`overflow-hidden`,
             para o canto arredondado da foto). O anel de foco, que nasce 2px
             para fora, sumiria inteiro — então aqui ele é desenhado para
             dentro, sobre o pôster. */
          className="group absolute inset-0 block size-full focus-visible:-outline-offset-4"
        >
          <MediaImage
            mediaId={mediaId}
            alt=""
            variant="thumb"
            sizes="(min-width: 1024px) 12rem, (min-width: 640px) 30vw, 45vw"
          />
          <VideoPosterMarks durationMs={durationMs} />
        </button>
      </SheetTrigger>

      <SheetContent
        title={`Vídeo de ${planTitle}`}
        description={`Duração: ${duracao}.`}
        className="sm:w-[40rem]"
      >
        <video
          ref={comecar}
          controls
          /* Sem "Baixar" no menu do player. O download pede o arquivo
             inteiro, sem Range, e é o único pedido que escapa da leitura em
             pedaços de 4 MB da rota — o player só lê em pedaços. E a mídia do
             DATE é para ser vista no app (`Content-Disposition: inline`). */
          controlsList="nodownload"
          playsInline
          preload="metadata"
          poster={`/api/media/${mediaId}?v=thumb`}
          src={`/api/media/${mediaId}`}
          className="bg-video-backdrop block max-h-[70dvh] w-full rounded-md object-contain"
        />
      </SheetContent>
    </Sheet>
  );
}
