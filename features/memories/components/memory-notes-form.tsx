"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import {
  saveMemoryNotesAction,
  type ActionState,
} from "@/features/memories/actions/memory-actions";
import {
  MAX_HIGHLIGHT_LENGTH,
  MAX_NOTES_LENGTH,
} from "@/features/memories/constants";

const INITIAL: ActionState = {};

/**
 * "Melhor parte" e observações, que são campos da própria avaliação.
 *
 * Só aparece depois de a pessoa dar uma nota: `rating` é NOT NULL, então a
 * linha nasce pela nota, e escrever antes disso não teria onde gravar. A
 * camada de dados recusa com essa mesma frase se alguém tentar pelo POST.
 *
 * Formulário com botão, e não salvamento a cada tecla: texto livre que se
 * grava sozinho a cada pausa gera uma escrita por palavra digitada, e aqui não
 * há nada que justifique isso.
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
    saveMemoryNotesAction,
    INITIAL,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="planId" value={planId} />

      <Input
        name="highlight"
        label="Melhor parte"
        defaultValue={highlight ?? ""}
        maxLength={MAX_HIGHLIGHT_LENGTH}
        placeholder="O que você não quer esquecer"
      />

      <Textarea
        name="notes"
        label="Observações"
        defaultValue={notes ?? ""}
        maxLength={MAX_NOTES_LENGTH}
        rows={3}
        placeholder="O que vale lembrar para a próxima vez"
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          loading={pending}
          loadingLabel="Salvando"
        >
          Salvar
        </Button>

        {state.ok ? (
          <span role="status" className="type-meta text-text-muted">
            Salvo.
          </span>
        ) : null}
      </div>

      {state.error ? (
        <p role="alert" className="type-body-s text-danger">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
