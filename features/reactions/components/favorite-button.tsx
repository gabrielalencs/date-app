"use client";

import { useActionState } from "react";
import { Bookmark } from "lucide-react";

import { IconButton } from "@/components/ui/icon-button";
import {
  toggleReactionAction,
  type ReactionActionState,
} from "@/features/discovery/actions/discovery-actions";

const INITIAL: ReactionActionState = {};

/**
 * Favoritar, no lugar onde favoritar acontece.
 *
 * Ele estava empilhado dentro do painel de reações, com a mesma forma e o mesmo
 * tamanho de "Quero muito", como se fossem duas respostas da mesma pergunta.
 * Não são: favorito não fala com a outra pessoa, não vai ao feed e não notifica
 * — é o marcador que faz a ideia voltar no filtro de /ideias.
 *
 * Um marcador pertence à beirada do que ele marca. Aqui ele é um ícone junto ao
 * título do plano, do tamanho de toque inteiro, e o estado vive no `aria-pressed`
 * e no preenchimento do ícone.
 */
export function FavoriteButton({
  planId,
  active,
}: {
  planId: string;
  active: boolean;
}) {
  const [state, action, pending] = useActionState(
    toggleReactionAction,
    INITIAL,
  );

  return (
    <form action={action} className="shrink-0">
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="type" value="favorite" />
      <IconButton
        type="submit"
        disabled={pending}
        aria-pressed={active}
        label={active ? "Remover dos favoritos" : "Favoritar"}
        className={active ? "text-accent" : "text-text-muted"}
        icon={
          <Bookmark
            className="size-5"
            fill={active ? "currentColor" : "none"}
          />
        }
      />
      {state.error ? (
        <span role="alert" className="sr-only">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
