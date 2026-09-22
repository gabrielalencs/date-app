"use client";

import { useActionState } from "react";
import { Heart, Meh, ThumbsDown, ThumbsUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  toggleReactionAction,
  type ReactionActionState,
} from "@/features/discovery/actions/discovery-actions";
import {
  OPINION_LABEL,
  OPINION_SAID,
  OPINION_TONE,
  OPINION_TYPES,
  type OpinionType,
} from "@/features/reactions/constants";
import type { MemberReactions } from "@/features/reactions/data/queries";
import { cn } from "@/lib/cn";

const INITIAL: ReactionActionState = {};

const ICONE: Record<OpinionType, LucideIcon> = {
  want_a_lot: Heart,
  like: ThumbsUp,
  meh: Meh,
  pass: ThumbsDown,
};

/**
 * A pergunta que a outra pessoa quer ver respondida.
 *
 * É uma fileira, e não uma pilha, porque as quatro respostas são alternativas
 * entre si — a mesma razão pela qual o voto de data é um controle segmentado.
 * Dois botões empilhados diziam "faça as duas coisas"; quatro chips lado a lado
 * dizem "escolha uma", que é a verdade.
 *
 * Um `form` por chip, com a resposta no `value`: sem `onChange`, sem estado de
 * cliente, e funcionando antes de a hidratação terminar. Tocar na resposta já
 * marcada retira — é a mesma regra do voto, e é o caminho de volta para "ainda
 * não respondi", que não é o mesmo que "tanto faz".
 */
export function PlanReactions({
  planId,
  members,
}: {
  planId: string;
  members: readonly MemberReactions[];
}) {
  const [state, action, pending] = useActionState(
    toggleReactionAction,
    INITIAL,
  );

  const eu = members.find((member) => member.isCurrent);
  const outros = members.filter((member) => !member.isCurrent);

  return (
    <section className="panel flex flex-col gap-5 !p-5">
      <div>
        <span className="type-label text-text-muted">Entre vocês</span>
        <h2 className="section-heading mt-2">O que vocês acham</h2>
      </div>

      {/* `radiogroup` e não `group`: são opções mutuamente exclusivas, e é assim
          que o leitor de tela anuncia "1 de 4" e o estado de cada uma. */}
      <div
        role="radiogroup"
        aria-label="Sua resposta sobre este DATE"
        /* Duas colunas no telefone, quatro a partir do tablet. O `lg:grid-cols-2`
           que existia aqui era para o rail estreito da direita, e o painel
           deixou de morar lá: no corpo da página, quatro chips de meia largura
           são quatro botões com ar de campo de formulário. */
        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
      >
        {OPINION_TYPES.map((opinion) => {
          const Icone = ICONE[opinion];
          const marcada = eu?.opinion === opinion;
          return (
            <form key={opinion} action={action} className="min-w-0">
              <input type="hidden" name="planId" value={planId} />
              <input type="hidden" name="type" value={opinion} />
              <button
                type="submit"
                role="radio"
                aria-checked={marcada}
                disabled={pending}
                className={cn(
                  "opinion-chip",
                  marcada
                    ? OPINION_TONE[opinion]
                    : "border-border-subtle bg-surface",
                )}
              >
                <Icone
                  aria-hidden="true"
                  className="size-4 shrink-0"
                  fill={marcada && opinion === "want_a_lot" ? "currentColor" : "none"}
                />
                <span className="truncate">{OPINION_LABEL[opinion]}</span>
              </button>
            </form>
          );
        })}
      </div>

      {/* A outra pessoa em uma linha, não numa tabela de duas colunas: a sua
          resposta já está marcada acima, então repeti-la aqui seria dizer duas
          vezes a mesma coisa no mesmo painel. */}
      <ul className="border-border-subtle divide-border-subtle divide-y border-y">
        {outros.map((member) => (
          <li
            key={member.profileId}
            className="flex min-h-11 items-center justify-between gap-3 py-2"
          >
            <span className="type-meta font-medium">{member.displayName}</span>
            <span className="type-meta text-text-muted text-right">
              {member.opinion
                ? OPINION_SAID[member.opinion]
                : "ainda não respondeu"}
            </span>
          </li>
        ))}
      </ul>

      {state.error ? (
        <p role="alert" className="type-body-s text-danger">
          {state.error}
        </p>
      ) : null}
    </section>
  );
}
