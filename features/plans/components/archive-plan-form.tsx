"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import {
  archivePlanAction,
  type ActionState,
} from "@/features/plans/actions/plan-actions";

const INITIAL: ActionState = {};

/** Arquivar esconde da lista. É ortogonal a status: não é cancelar. */
export function ArchivePlanForm({
  planId,
  archived,
}: {
  planId: string;
  archived: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    archivePlanAction,
    INITIAL,
  );

  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      <input type="hidden" name="planId" value={planId} />
      {archived ? <input type="hidden" name="unarchive" value="on" /> : null}

      <Button
        type="submit"
        variant={archived ? "secondary" : "ghost"}
        size="sm"
        loading={pending}
        loadingLabel={archived ? "Restaurando" : "Arquivando"}
      >
        {archived ? "Tirar do arquivo" : "Arquivar"}
      </Button>

      <p className="type-meta text-text-muted">
        {archived
          ? "Some da lista de Ideias enquanto estiver arquivado."
          : "Arquivar esconde da lista sem cancelar o plano."}
      </p>

      {state.error ? (
        <p role="alert" className="type-body-s text-danger">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
