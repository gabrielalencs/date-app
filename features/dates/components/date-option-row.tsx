"use client";

import { useActionState } from "react";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  confirmDateOptionAction,
  deleteDateOptionAction,
  unconfirmDateAction,
  type ActionState,
} from "@/features/dates/actions/date-actions";
import { VoteControl } from "@/features/dates/components/vote-control";
import type { DateOption } from "@/features/dates/data/queries";
import { CONSENSUS_TONE } from "@/lib/consensus";
import { cn } from "@/lib/cn";
import {
  civilDayCount,
  formatDay,
  formatDaySpan,
  formatTime,
  formatWeekday,
} from "@/lib/datetime";
import type { PlanStatus } from "@/lib/status";

const INITIAL: ActionState = {};

/** Ponto de cor. O rótulo ao lado fica sempre em `--text` ou `--text-muted` (D-020). */
const TOM: Record<string, string> = {
  positive: "bg-positive",
  accent: "bg-accent",
  danger: "bg-danger",
  muted: "bg-border-strong",
};

/** Inicial da pessoa, para os dois votos caberem lado a lado. */
function inicial(nome: string): string {
  return nome.trim().charAt(0).toUpperCase() || "?";
}

const MARCA: Record<string, string> = {
  yes: "Sim",
  maybe: "Talvez",
  no: "Não",
};

/**
 * Uma opção de data é uma **linha**, não um card (seção 9).
 *
 * Cinco datas candidatas em cinco caixas empilhadas seriam exatamente o "cards
 * por todo lado sem hierarquia" que a seção 11 do spec proíbe. A separação é
 * por fio, e a hierarquia vem da tipografia: dia da semana em Fraunces, porque
 * é o que se olha para decidir, e o horário em Inter tabular embaixo.
 */
export function DateOptionRow({
  planId,
  planStatus,
  option,
  now,
}: {
  planId: string;
  planStatus: PlanStatus;
  option: DateOption;
  /** Referência de "ano atual" vinda do servidor, para não divergir na hidratação. */
  now: Date;
}) {
  const [confirmState, confirmAction, confirming] = useActionState(
    confirmDateOptionAction,
    INITIAL,
  );
  const [unconfirmState, unconfirmAction, unconfirming] = useActionState(
    unconfirmDateAction,
    INITIAL,
  );
  const [deleteState, deleteAction, deleting] = useActionState(
    deleteDateOptionAction,
    INITIAL,
  );

  /* Um rolê de vários dias tem fim; um de um dia só, não. O `endsAt` guarda a
     meia-noite do último dia civil, então basta ele existir. A constante local
     é o que estreita o tipo — `option.endsAt` sozinho voltaria a ser
     `Date | null` dentro do JSX e pediria um `!` para calar o compilador. */
  const fim = option.endsAt;
  const dias = fim ? civilDayCount(option.startsAt, fim) : 1;

  const encerrado = planStatus === "completed" || planStatus === "cancelled";
  /* Confirmada, a data deixa de estar em votação. Sim/Talvez/Não ao lado de
     "Data confirmada" é a tela perguntando de novo o que já foi decidido — e,
     pior, deixando mudar o voto sem que isso mude coisa alguma. Quem quiser
     reabrir a conversa usa "Desmarcar", que devolve a data à negociação com
     todas as opções de volta. Os votos registrados continuam à vista. */
  const emVotacao = !encerrado && !option.isConfirmed;
  const podeConfirmar = !option.isConfirmed && !encerrado;
  const podeDesmarcar = option.isConfirmed && planStatus === "planned";
  const erro = confirmState.error ?? unconfirmState.error ?? deleteState.error;

  return (
    <li
      className={cn(
        "border-border-subtle flex flex-col gap-3 border-t py-4 first:border-t-0",
        option.isConfirmed && "bg-sage-soft rounded-md px-4",
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex flex-col gap-0.5">
          <p className="type-title text-text">
            {fim
              ? formatDaySpan(option.startsAt, fim)
              : `${formatWeekday(option.startsAt)}, ${formatDay(option.startsAt, now)}`}
          </p>
          <p className="type-body-s text-text-muted tnum">
            {fim ? `${dias} dias · ` : null}
            {option.allDay
              ? fim
                ? "dia inteiro"
                : "Dia inteiro"
              : `${fim ? "a partir de " : ""}${formatTime(option.startsAt)}`}
          </p>
        </div>

        {option.isConfirmed ? (
          <span className="type-label text-text inline-flex items-center gap-1.5">
            <Check aria-hidden="true" className="size-4" strokeWidth={2.5} />
            Data confirmada
          </span>
        ) : option.consensus.label ? (
          <span className="type-body-s text-text-muted inline-flex items-center gap-2">
            <span
              aria-hidden="true"
              className={cn(
                "size-2 shrink-0 rounded-full",
                TOM[CONSENSUS_TONE[option.consensus.state]],
              )}
            />
            {option.consensus.label}
          </span>
        ) : null}
      </div>

      {option.note ? (
        <p className="type-body-s text-text-muted">{option.note}</p>
      ) : null}

      {/* Votar numa data de um date que já aconteceu não é caso de uso: a
          negociação terminou, e o controle ali só empurraria para baixo o que
          passou a importar — a avaliação, as fotos e o gasto. O mesmo vale para
          plano cancelado e para a data já confirmada. Os votos que existiram
          continuam visíveis. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {emVotacao ? (
          <VoteControl
            planId={planId}
            optionId={option.id}
            myVote={option.myVote}
          />
        ) : (
          <span />
        )}

        <ul className="type-meta text-text-muted flex items-center gap-3">
          {option.votes.map((voto) => (
            <li key={voto.profileId} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="border-border-strong text-text grid size-7 place-items-center rounded-full border text-xs font-medium"
              >
                {inicial(voto.displayName)}
              </span>
              <span>
                <span className="sr-only">{voto.displayName}: </span>
                {voto.vote ? MARCA[voto.vote] : "sem voto"}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {podeConfirmar ? (
          <form action={confirmAction}>
            <input type="hidden" name="planId" value={planId} />
            <input type="hidden" name="optionId" value={option.id} />
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              loading={confirming}
              loadingLabel="Confirmando"
            >
              Confirmar esta data
            </Button>
          </form>
        ) : null}

        {podeDesmarcar ? (
          <form action={unconfirmAction}>
            <input type="hidden" name="planId" value={planId} />
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              loading={unconfirming}
              loadingLabel="Desmarcando"
            >
              Desmarcar
            </Button>
          </form>
        ) : null}

        {!option.isConfirmed ? (
          <form action={deleteAction}>
            <input type="hidden" name="planId" value={planId} />
            <input type="hidden" name="optionId" value={option.id} />
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              loading={deleting}
              loadingLabel="Apagando"
            >
              Apagar
            </Button>
          </form>
        ) : null}
      </div>

      {erro ? (
        <p role="alert" className="type-body-s text-danger">
          {erro}
        </p>
      ) : null}
    </li>
  );
}
