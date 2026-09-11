"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import {
  changeStatusAction,
  type ActionState,
} from "@/features/plans/actions/plan-actions";
import { allowedTransitions } from "@/lib/plan-status";
import { statusLabel, type PlanStatus } from "@/lib/status";

const INITIAL: ActionState = {};

/**
 * A UI só oferece as transições que a máquina permite — mas o servidor valida
 * de novo: o botão que não existe na tela ainda pode ser forjado no POST.
 */
export function PlanStatusControl({
  planId,
  status,
}: {
  planId: string;
  status: PlanStatus;
}) {
  const [state, formAction, pending] = useActionState(
    changeStatusAction,
    INITIAL,
  );
  const options = allowedTransitions(status);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="type-label text-text-muted">Status</h2>

      <div className="flex items-center gap-3">
        <StatusPill status={status} />
        {options.length === 0 ? (
          <span className="type-meta text-text-muted">
            Realizado é definitivo.
          </span>
        ) : null}
      </div>

      {options.length > 0 ? (
        <form action={formAction} className="flex flex-wrap gap-2">
          <input type="hidden" name="planId" value={planId} />
          {options.map((option) => (
            <Button
              key={option}
              type="submit"
              name="status"
              value={option}
              variant="secondary"
              size="sm"
              loading={pending}
              loadingLabel="Mudando"
            >
              {statusLabel(option)}
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
