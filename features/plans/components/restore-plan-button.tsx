"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import {
  archivePlanAction,
  type ActionState,
} from "@/features/plans/actions/plan-actions";

const INITIAL: ActionState = {};

/**
 * Restaurar, de dentro da lista do arquivo.
 *
 * Usa a mesma action do botão da página de detalhe — restaurar é um caminho só,
 * e dois seriam duas oportunidades de divergir. O rótulo acessível carrega o
 * título porque a lista tem vários botões idênticos, e "Restaurar" sozinho não
 * diz qual.
 */
export function RestorePlanButton({
  planId,
  title,
}: {
  planId: string;
  title: string;
}) {
  const [state, formAction, pending] = useActionState(
    archivePlanAction,
    INITIAL,
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="unarchive" value="on" />

      <Button
        type="submit"
        variant="secondary"
        size="sm"
        loading={pending}
        loadingLabel="Restaurando"
        aria-label={`Restaurar ${title}`}
      >
        Restaurar
      </Button>

      {state.error ? (
        <p role="alert" className="type-meta text-danger mt-2">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
