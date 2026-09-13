"use client";

import { useActionState, useRef } from "react";
import { Star } from "lucide-react";

import {
  rateMemoryAction,
  type ActionState,
} from "@/features/memories/actions/memory-actions";
import { cn } from "@/lib/cn";
import {
  RATING_VALUES,
  ratingOptionLabel,
  type RatingValue,
} from "@/lib/rating";

const INITIAL: ActionState = {};

/**
 * A nota de quem está olhando, de 1 a 5.
 *
 * É um **radiogroup com legenda**, não cinco ícones soltos (seção 4 do
 * docs/MEMORIES.md). Cada posição tem nome acessível próprio — "3 de 5" —,
 * porque "estrela 3" não diz a escala a quem ouve o rótulo sem ver o desenho.
 *
 * A distinção é por **preenchimento**, não por cor: a mesma exigência do
 * marcador do calendário do B7, e verificável em escala de cinza. Estrela cheia
 * e estrela contornada continuam diferentes sem nenhuma cor.
 *
 * Reenviar a nota que já está escolhida a **retira**, como o controle de voto
 * do B6: o controle não tem "desmarcar", e a pessoa volta a "ainda não
 * avaliou" — estado distinto de ter dado nota baixa (D-062).
 *
 * Cada posição é um `<button type="submit">` com `value` próprio, então o
 * controle inteiro é um formulário só e funciona sem estado local. As setas do
 * teclado movem o foco, que é o que um radiogroup precisa fazer e o que uma
 * fila de botões não faz sozinha.
 */
export function RatingControl({
  planId,
  personName,
  rating,
  editable,
}: {
  planId: string;
  personName: string;
  rating: RatingValue | null;
  /** Só quem está olhando avalia a própria nota; a do outro é leitura. */
  editable: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    rateMemoryAction,
    INITIAL,
  );
  const grupo = useRef<HTMLDivElement>(null);

  const legenda = editable ? "Sua nota" : "Nota";

  if (!editable) {
    /* Sem nota, a legenda "Nota" some: o nome da pessoa já é o cabeçalho da
       coluna, e "Nota" seguido de "Fulano ainda não avaliou" põe o mesmo nome
       três vezes na mesma altura da tela. */
    return (
      <div className="flex flex-col gap-1">
        {rating === null ? null : (
          <span className="type-meta text-text-muted">{legenda}</span>
        )}
        <StaticRating rating={rating} personName={personName} />
      </div>
    );
  }

  function moverFoco(evento: React.KeyboardEvent<HTMLDivElement>): void {
    const passo =
      evento.key === "ArrowRight" || evento.key === "ArrowDown"
        ? 1
        : evento.key === "ArrowLeft" || evento.key === "ArrowUp"
          ? -1
          : 0;

    if (passo === 0) return;

    const botoes = Array.from(
      grupo.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ??
        [],
    );
    const atual = botoes.findIndex((botao) => botao === document.activeElement);

    if (atual === -1) return;

    evento.preventDefault();
    const proximo = (atual + passo + botoes.length) % botoes.length;
    botoes[proximo]?.focus();
  }

  return (
    <div className="flex flex-col gap-1">
      <form action={formAction} className="flex flex-col gap-1">
        <input type="hidden" name="planId" value={planId} />
        <span id={`nota-${planId}`} className="type-meta text-text-muted">
          {legenda}
        </span>

        <div
          ref={grupo}
          role="radiogroup"
          aria-labelledby={`nota-${planId}`}
          onKeyDown={moverFoco}
          className="flex items-center gap-0.5"
        >
          {RATING_VALUES.map((value, indice) => {
            const preenchida = rating !== null && value <= rating;
            const escolhida = rating === value;

            return (
              <button
                key={value}
                type="submit"
                name="rating"
                // Reenviar a nota escolhida a retira: não há "desmarcar".
                value={escolhida ? "" : String(value)}
                role="radio"
                aria-checked={escolhida}
                aria-label={ratingOptionLabel(value)}
                /* Roving tabindex: o grupo inteiro é uma parada de tabulação,
                   e as setas andam dentro dele. Sem escolha, a primeira
                   posição recebe o foco. */
                tabIndex={
                  escolhida || (rating === null && indice === 0) ? 0 : -1
                }
                disabled={pending}
                className={cn(
                  "ease-standard grid size-11 place-items-center rounded-sm",
                  "transition-[opacity,transform] duration-[var(--duration-micro)]",
                  "hover:bg-surface-sunken active:scale-[0.97]",
                  "disabled:pointer-events-none disabled:opacity-60",
                )}
              >
                <Star
                  aria-hidden="true"
                  className="size-6"
                  fill={preenchida ? "currentColor" : "none"}
                  strokeWidth={1.75}
                />
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

/**
 * A nota da outra pessoa, em leitura.
 *
 * As duas avaliações são **sempre** visíveis: esconder até avaliar evitaria
 * ancoragem, e de novo a transparência é o produto (D-062). A ausência aparece
 * como frase, nunca como cinco estrelas vazias que se confundem com nota 0.
 */
function StaticRating({
  rating,
  personName,
}: {
  rating: RatingValue | null;
  personName: string;
}) {
  if (rating === null) {
    return (
      <p className="type-body-s text-text-muted">
        {personName} ainda não avaliou.
      </p>
    );
  }

  return (
    <div
      className="flex items-center gap-0.5"
      role="img"
      aria-label={ratingOptionLabel(rating)}
    >
      {RATING_VALUES.map((value) => (
        <span key={value} className="grid size-6 place-items-center">
          <Star
            aria-hidden="true"
            className="size-5"
            fill={value <= rating ? "currentColor" : "none"}
            strokeWidth={1.75}
          />
        </span>
      ))}
    </div>
  );
}
