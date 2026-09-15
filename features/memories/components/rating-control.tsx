"use client";

import { useActionState, useRef } from "react";
import { Star } from "lucide-react";

import {
  rateMemoryAction,
  type ActionState,
} from "@/features/memories/actions/memory-actions";
import {
  RATING_VALUES,
  ratingOptionLabel,
  type RatingValue,
} from "@/lib/rating";
import { cn } from "@/lib/cn";

const INITIAL: ActionState = {};

/**
 * A nota de 1 a 5 (seção 4 do docs/MEMORIES.md).
 *
 * `<fieldset>` com `<legend>` e cinco `<input type="radio">` reais, não cinco
 * ícones soltos com `onClick`. Radios de mesmo `name` já são um `radiogroup`
 * para o leitor de tela, já navegam por seta e já têm nome acessível pelo
 * `<label>` — escrever isso à mão com `role` e roving tabindex daria o mesmo
 * comportamento com mais chance de errar.
 *
 * A distinção entre marcada e vazia é por **preenchimento**, não por cor: a
 * mesma exigência do marcador do calendário, e verificável numa captura em
 * escala de cinza. Se as cinco estrelas virarem o mesmo cinza, a distinção
 * estava só na cor.
 *
 * Reenviar a mesma nota a retira, como o controle de voto do B6. O gesto é
 * clicar na estrela que já está marcada: o radio é desmarcado, o `FormData`
 * vai sem `rating`, e a action lê isso como retirar.
 */
export function RatingControl({
  planId,
  value,
  hasNotes,
}: {
  planId: string;
  value: RatingValue | null;
  /** Muda o aviso: retirar a nota leva junto o que a pessoa escreveu. */
  hasNotes: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    rateMemoryAction,
    INITIAL,
  );
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="planId" value={planId} />

      <fieldset disabled={pending} className="flex flex-col gap-2">
        <legend className="type-label text-text-muted mb-2">Sua nota</legend>

        <div className="flex flex-wrap items-center gap-1">
          {RATING_VALUES.map((nota) => {
            const marcada = value !== null && nota <= value;

            return (
              <label
                key={nota}
                className={cn(
                  "ease-standard grid min-h-11 min-w-11 cursor-pointer place-items-center rounded-md",
                  "transition-[background-color,transform] duration-[var(--duration-micro)]",
                  "hover:bg-surface-sunken active:scale-[0.98]",
                  "focus-within:outline-accent focus-within:outline-2 focus-within:outline-offset-2",
                )}
              >
                <input
                  type="radio"
                  name="rating"
                  value={nota}
                  defaultChecked={value === nota}
                  className="sr-only"
                  onClick={(event) => {
                    /* Clicar na nota que já vale retira a avaliação. `change`
                       não dispara nesse caso — só `click` —, então é aqui que
                       o radio é desmarcado antes de submeter. */
                    if (value === nota) {
                      event.currentTarget.checked = false;
                    }
                    formRef.current?.requestSubmit();
                  }}
                />
                <Star
                  aria-hidden="true"
                  className={cn(
                    "size-6",
                    marcada ? "text-accent" : "text-text-muted",
                  )}
                  fill={marcada ? "currentColor" : "none"}
                  strokeWidth={marcada ? 1 : 1.5}
                />
                <span className="sr-only">{ratingOptionLabel(nota)}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <p className="type-meta text-text-muted">
        {value === null
          ? "Toque numa estrela para avaliar."
          : hasNotes
            ? "Toque na nota atual para retirar sua avaliação — o que você escreveu sai junto."
            : "Toque na nota atual para retirar sua avaliação."}
      </p>

      {state.error ? (
        <p role="alert" className="type-meta text-danger">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
