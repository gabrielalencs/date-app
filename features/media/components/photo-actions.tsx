"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Star, Trash2 } from "lucide-react";

import { IconButton } from "@/components/ui/icon-button";
import {
  removeMediaAction,
  reorderMediaAction,
  setCoverAction,
} from "@/features/media/actions/media-actions";

/**
 * Os controles de uma foto da galeria: virar capa, mover na ordem, remover.
 *
 * Reordenação por botão e não por arrastar. Arrastar em toque exige distinguir
 * arrasto de rolagem, e num produto de duas pessoas com poucas fotos por plano
 * o par de setas resolve o mesmo problema, funciona no teclado e não precisa
 * de biblioteca. Se um dia a galeria tiver vinte fotos, isto vira arrastar.
 */
type Estado = "parado" | "trabalhando";

export function PhotoActions({
  planId,
  mediaId,
  isCover,
  canMoveUp,
  canMoveDown,
  onMove,
}: {
  planId: string;
  mediaId: string;
  isCover: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  /** Devolve a nova ordem completa; a action recusa lista que não confira. */
  onMove: (direction: -1 | 1) => string[];
}) {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>("parado");
  const [erro, setErro] = useState<string | null>(null);

  const ocupado = estado === "trabalhando";

  async function executar(
    acao: () => Promise<{ ok: boolean; error?: string }>,
  ) {
    setEstado("trabalhando");
    setErro(null);

    try {
      const resultado = await acao();
      if (resultado.ok) {
        router.refresh();
      } else {
        setErro(resultado.error ?? "Não deu para fazer isso agora.");
      }
    } finally {
      setEstado("parado");
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1">
        <IconButton
          label={isCover ? "Já é a capa" : "Usar como capa"}
          icon={
            <Star
              className="size-4"
              fill={isCover ? "currentColor" : "none"}
              strokeWidth={1.75}
            />
          }
          disabled={ocupado || isCover}
          onClick={() =>
            void executar(() => setCoverAction({ planId, mediaId }))
          }
        />

        <IconButton
          label="Mover para trás"
          icon={<ArrowLeft className="size-4" />}
          disabled={ocupado || !canMoveUp}
          onClick={() =>
            void executar(() =>
              reorderMediaAction({ planId, orderedMediaIds: onMove(-1) }),
            )
          }
        />

        <IconButton
          label="Mover para frente"
          icon={<ArrowRight className="size-4" />}
          disabled={ocupado || !canMoveDown}
          onClick={() =>
            void executar(() =>
              reorderMediaAction({ planId, orderedMediaIds: onMove(1) }),
            )
          }
        />

        <IconButton
          label="Remover foto"
          icon={<Trash2 className="size-4" />}
          disabled={ocupado}
          className="text-danger hover:bg-surface-sunken"
          onClick={() => {
            if (
              window.confirm(
                "Remover esta foto? Ela sai do plano e do armazenamento.",
              )
            ) {
              void executar(() => removeMediaAction({ planId, mediaId }));
            }
          }}
        />
      </div>

      {erro ? (
        <p role="alert" className="type-meta text-danger">
          {erro}
        </p>
      ) : null}
    </div>
  );
}
