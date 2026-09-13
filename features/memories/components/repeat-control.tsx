"use client";

import { useActionState } from "react";

import {
  REPEAT_LABELS,
  REPEAT_QUESTION,
} from "@/features/memories/constants";
import {
  setRepeatAction,
  type ActionState,
} from "@/features/memories/actions/memory-actions";
import { cn } from "@/lib/cn";
import { REPEAT_ANSWERS, type RepeatAnswer } from "@/lib/rating";

const INITIAL: ActionState = {};

/**
 * "Repetiria?" — o **mesmo** controle segmentado do voto do B6, com rótulos
 * próprios (seção 4 do docs/MEMORIES.md). Mesmo comportamento: preenchimento
 * invertido mais `aria-pressed`, cor nunca sozinha, e reenviar a resposta
 * escolhida a retira.
 *
 * Só aparece depois da nota. `memory_ratings.rating` é `NOT NULL` desde o B2,
 * então não existe "repetiria" sem nota — e a camada de dados recusa de novo,
 * porque o frontend nunca é fonte de autoridade.
 */
export function RepeatControl({
  planId,
  answer,
}: {
  planId: string;
  answer: RepeatAnswer | null;
}) {
  const [state, formAction, pending] = useActionState(
    setRepeatAction,
    INITIAL,
  );

  return (
    <div className="flex flex-col gap-1">
      <form action={formAction} className="flex flex-col gap-1">
        <input type="hidden" name="planId" value={planId} />
        <span className="type-meta text-text-muted">{REPEAT_QUESTION}</span>

        <div
          className="border-border-subtle bg-surface-soft inline-flex rounded-md border p-1"
          aria-label={REPEAT_QUESTION}
        >
          {REPEAT_ANSWERS.map((value) => {
            const escolhido = answer === value;

            return (
              <button
                key={value}
                type="submit"
                name="repeat"
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
                {REPEAT_LABELS[value]}
              </button>
            );
          })}
        </div>
      </form>

      {state.error ? (
        <p role="alert" className="type-meta text-danger">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}

/** A resposta da outra pessoa, em leitura. Ausência é frase, não silêncio. */
export function RepeatAnswerText({
  answer,
  personName,
}: {
  answer: RepeatAnswer | null;
  personName: string;
}) {
  return (
    <p className="type-body-s text-text-muted">
      {answer === null
        ? `${personName} não disse se repetiria.`
        : `${REPEAT_QUESTION} ${REPEAT_LABELS[answer]}`}
    </p>
  );
}
