"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import {
  MAX_HIGHLIGHT_LENGTH,
  MAX_NOTES_LENGTH,
} from "@/features/memories/constants";
import {
  saveMemoryTextAction,
  type ActionState,
} from "@/features/memories/actions/memory-actions";

const INITIAL: ActionState = {};

/**
 * A melhor parte e as observações — **do casal**, uma por plano.
 *
 * Não é por pessoa de propósito (seção 4 do docs/MEMORIES.md): a melhor parte
 * de uma noite é uma coisa só, escrita junto. Duplicá-la por pessoa
 * transformaria uma lembrança compartilhada em dois depoimentos paralelos.
 *
 * Campo livre, sem contador regressivo e sem placeholder que sugira o que
 * escrever: quem viveu a noite sabe, e o produto não precisa dar ideia.
 */
export function MemoryNotesForm({
  planId,
  highlight,
  notes,
}: {
  planId: string;
  highlight: string | null;
  notes: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    saveMemoryTextAction,
    INITIAL,
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="planId" value={planId} />

      <Input
        label="A melhor parte"
        name="highlight"
        defaultValue={highlight ?? ""}
        maxLength={MAX_HIGHLIGHT_LENGTH}
        autoComplete="off"
      />

      <Textarea
        label="Observações"
        name="notes"
        defaultValue={notes ?? ""}
        maxLength={MAX_NOTES_LENGTH}
        rows={3}
      />

      {state.error ? (
        <p role="alert" className="type-body-s text-danger">
          {state.error}
        </p>
      ) : null}

      <Button
        type="submit"
        variant="secondary"
        size="sm"
        loading={pending}
        loadingLabel="Guardando"
        className="self-start"
      >
        Guardar
      </Button>
    </form>
  );
}
