"use client";

import { useActionState } from "react";

import {
  setWouldRepeatAction,
  type ActionState,
} from "@/features/memories/actions/memory-actions";
import { REPEAT_LABELS, REPEAT_VALUES, type RepeatAnswer } from "@/lib/rating";
import { cn } from "@/lib/cn";

const INITIAL: ActionState = {};

/**
 * "Repetiria?" — o mesmo controle segmentado do voto do B6, com rótulos
 * próprios (seção 4).
 *
 * Mesmo comportamento, inclusive o de reenviar a mesma resposta para retirá-la:
 * cada posição é um `<button type="submit">` com `value` próprio, então o
 * controle inteiro é um formulário só e funciona sem estado local. A escolha é
 * marcada por preenchimento **mais** `aria-pressed` — cor nunca é o único
 * portador de significado.
 *
 * O preenchimento é invertido (`--text` sobre `--surface`), não coral: rótulo
 * branco sobre coral só é legível a partir de 19px semibold, e este controle é
 * de 14px (D-017).
 */
export function RepeatControl({
  planId,
  value,
}: {
  planId: string;
  value: RepeatAnswer | null;
}) {
  const [state, formAction, pending] = useActionState(
    setWouldRepeatAction,
    INITIAL,
  );

  return (
    <div className="flex flex-col gap-2">
      <span className="type-label text-text-muted">Repetiria?</span>

      <form
        action={formAction}
        className="border-border-subtle bg-surface-soft inline-flex w-fit rounded-md border p-1"
        aria-label="Você repetiria esse date?"
      >
        <input type="hidden" name="planId" value={planId} />

        {REPEAT_VALUES.map((answer) => {
          const escolhido = value === answer;

          return (
            <button
              key={answer}
              type="submit"
              name="wouldRepeat"
              // Reenviar a mesma resposta retira: não há "desmarcar" ao lado.
              value={escolhido ? "" : answer}
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
              {REPEAT_LABELS[answer]}
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
