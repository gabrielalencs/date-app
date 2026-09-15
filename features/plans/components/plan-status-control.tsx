"use client";

import { useActionState } from "react";
import { Circle, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { CompletePlanControl } from "@/features/memories/components/complete-plan-control";
import {
  changeStatusAction,
  type ActionState,
} from "@/features/plans/actions/plan-actions";
import { offerableTransitions, type PlanFacts } from "@/lib/plan-preconditions";
import { statusLabel, type PlanStatus } from "@/lib/status";

const INITIAL: ActionState = {};

/**
 * A UI só oferece as transições que a máquina permite **e** que os fatos
 * autorizam — mas o servidor valida de novo: o botão que não existe na tela
 * ainda pode ser forjado no POST.
 *
 * É a primeira das duas consultas às pré-condições (seção 4 do
 * docs/PLANNING.md). Sem ela, a tela ofereceria Reservado num plano sem
 * reserva confirmada, e o clique só descobriria o impedimento depois do POST.
 *
 * `completed` sai da lista de botões e ganha controle próprio (B9): é a única
 * transição irreversível do produto, e passa por confirmação em modal. A
 * decisão de oferecê-la continua sendo a mesma — `offerableTransitions` —, o
 * que muda é o que aparece quando ela é oferecida.
 */
export function PlanStatusControl({
  planId,
  status,
  facts,
}: {
  planId: string;
  status: PlanStatus;
  facts: PlanFacts;
}) {
  const [state, formAction, pending] = useActionState(
    changeStatusAction,
    INITIAL,
  );
  const oferecidas = offerableTransitions(status, facts);
  const podeConcluir = oferecidas.includes("completed");
  const options = oferecidas.filter((option) => option !== "completed");

  return (
    <section className="flex flex-col gap-3">
      <h2 className="section-heading">O plano está...</h2>

      <div className="flex items-center gap-3">
        <StatusPill status={status} />
        {oferecidas.length === 0 ? (
          <span className="type-meta text-text-muted">
            Realizado é definitivo.
          </span>
        ) : null}
      </div>

      {podeConcluir ? <CompletePlanControl planId={planId} /> : null}

      {options.length > 0 ? (
        <form action={formAction} className="flex flex-col gap-2">
          <input type="hidden" name="planId" value={planId} />
          {options.map((option) => (
            <Button
              key={option}
              type="submit"
              name="status"
              value={option}
              variant="outline"
              size="sm"
              loading={pending}
              loadingLabel="Mudando"
              className="justify-start"
            >
              <Circle aria-hidden="true" className="size-4" />
              {statusLabel(option)}
              <ArrowRight aria-hidden="true" className="ml-auto size-3.5" />
            </Button>
          ))}
        </form>
      ) : null}

      {state.error ? (
        <p role="alert" className="type-body-s text-danger">
          {state.error}
        </p>
      ) : null}
    </section>
  );
}
