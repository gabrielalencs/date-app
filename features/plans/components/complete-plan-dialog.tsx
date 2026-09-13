"use client";

import { useActionState, useState } from "react";
import { CheckCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  changeStatusAction,
  type ActionState,
} from "@/features/plans/actions/plan-actions";

const INITIAL: ActionState = {};

/**
 * Marcar como realizado — a ação mais séria do produto, e a única sem volta.
 *
 * `completed` é terminal na máquina de status de propósito: desfazer um date
 * realizado deixaria a avaliação e as fotos penduradas num plano que voltou a
 * ser ideia. Então passa por confirmação em **modal**, o segundo uso sancionado
 * neste produto ao lado da remoção de foto (D-080).
 *
 * O botão só existe quando as pré-condições deixam — há data confirmada, e ela
 * já chegou. A mutation checa de novo dentro da transação: o botão que não
 * existe na tela ainda pode ser forjado no POST.
 */
export function CompletePlanDialog({ planId }: { planId: string }) {
  const [state, formAction, pending] = useActionState(
    changeStatusAction,
    INITIAL,
  );
  const [aberto, setAberto] = useState(false);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-start"
        >
          <CheckCheck aria-hidden="true" className="size-4" />
          Marcar como realizado
        </Button>
      </DialogTrigger>

      <DialogContent
        title="Marcar como realizado?"
        description="Isso não tem volta. O plano sai das ideias e passa a viver nas Memórias — é lá que vocês dão a nota e guardam as fotos do dia."
      >
        {state.error ? (
          <p role="alert" className="type-body-s text-danger">
            {state.error}
          </p>
        ) : null}

        <form action={formAction} className="flex flex-wrap justify-end gap-3">
          <input type="hidden" name="planId" value={planId} />
          <input type="hidden" name="status" value="completed" />

          <DialogClose asChild>
            <Button type="button" variant="secondary" disabled={pending}>
              Ainda não
            </Button>
          </DialogClose>

          <Button type="submit" loading={pending} loadingLabel="Marcando">
            Marcar como realizado
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
