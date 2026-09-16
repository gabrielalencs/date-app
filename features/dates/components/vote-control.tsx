"use client";

import { useActionState } from "react";

import {
  castVoteAction,
  type ActionState,
} from "@/features/dates/actions/date-actions";
import { VOTE_LABELS, VOTE_VALUES, type VoteValue } from "@/lib/consensus";
import { cn } from "@/lib/cn";

const INITIAL: ActionState = {};

/**
 * Controle segmentado de três posições: Sim, Talvez, Não (seção 9).
 *
 * Sem ícone e sem emoji, e a escolha é marcada por preenchimento **mais** por
 * `aria-pressed` — cor nunca é o único portador de significado. Clicar na opção
 * já escolhida retira o voto, que devolve a pessoa a "ainda não respondeu", um
 * estado distinto de ter votado "não" (seção 4).
 *
 * O preenchimento é invertido (`--text` sobre `--surface`), não coral: rótulo
 * branco sobre coral só é legível a partir de 19px semibold, e este controle é
 * de 14px (D-017). A inversão passa em contraste nos dois temas.
 *
 * Cada posição é um `<button type="submit">` com `value` próprio, então o
 * controle inteiro é um formulário só e funciona sem estado local.
 */
export function VoteControl({
  planId,
  optionId,
  myVote,
}: {
  planId: string;
  optionId: string;
  myVote: VoteValue | null;
}) {
  const [state, formAction, pending] = useActionState(castVoteAction, INITIAL);

  return (
    <div className="flex flex-col gap-1">
      <form
        action={formAction}
        className="border-border-subtle bg-surface-soft inline-flex rounded-md border p-1"
        aria-label="Seu voto nesta data"
      >
        <input type="hidden" name="planId" value={planId} />
        <input type="hidden" name="optionId" value={optionId} />

        {VOTE_VALUES.map((value) => {
          const escolhido = myVote === value;

          return (
            <button
              key={value}
              type="submit"
              name="vote"
              // Reenviar o mesmo voto retira: o controle não tem "desmarcar".
              value={escolhido ? "" : value}
              disabled={pending}
              aria-pressed={escolhido}
              className={cn(
                "ease-standard min-h-11 rounded-sm px-3 text-sm font-medium",
                "transition-[opacity,transform] duration-[var(--duration-micro)]",
                "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60",
                escolhido
                  ? "bg-brand text-brand-fg"
                  : "text-text hover:bg-surface-sunken",
              )}
            >
              {VOTE_LABELS[value]}
            </button>
          );
        })}
      </form>

      {state.error ? (
        <p role="alert" className="type-meta text-danger">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
