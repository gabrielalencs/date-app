"use client";

import { useActionState, useEffect, useRef } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/field";
import {
  addChecklistItemAction,
  deleteChecklistItemAction,
  moveChecklistItemAction,
  toggleChecklistItemAction,
  type ActionState,
} from "@/features/planning/actions/planning-actions";
import type { ChecklistEntry } from "@/features/planning/data/queries";
import { cn } from "@/lib/cn";
import { formatRelativeDay } from "@/lib/datetime";

const INITIAL: ActionState = {};

/**
 * Uma linha do checklist.
 *
 * O alvo de toque é o `<label>`, com `min-h-12` — nunca o quadrado de 20px. A
 * medição do B5 já tropeçou nisso uma vez, e é por isso que o teste mede o
 * label e não o input.
 *
 * O checkbox envia o formulário ao mudar: marcar um item é uma ação, e um botão
 * "salvar" ao lado de cada linha seria atrito puro. Depende de JavaScript, como
 * toda mutation do produto (D-056).
 */
export function ChecklistRow({
  planId,
  item,
  now,
  readOnly,
  isFirst,
  isLast,
}: {
  planId: string;
  item: ChecklistEntry;
  now: Date;
  readOnly: boolean;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [toggleState, toggleAction, togglePending] = useActionState(
    toggleChecklistItemAction,
    INITIAL,
  );
  const [moveState, moveAction, movePending] = useActionState(
    moveChecklistItemAction,
    INITIAL,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteChecklistItemAction,
    INITIAL,
  );

  const marcado = item.doneAt !== null;
  const formRef = useRef<HTMLFormElement>(null);
  const checkboxRef = useRef<HTMLInputElement>(null);

  /* O input nativo responde ao toque imediatamente. Quando a resposta chega,
     sincroniza com o fato do servidor; se a mutation falhou, isso também
     desfaz a marca visual que não chegou ao banco. */
  useEffect(() => {
    if (checkboxRef.current) checkboxRef.current.checked = marcado;
  }, [marcado, toggleState]);

  return (
    <li
      data-checklist-item={item.id}
      data-done={marcado}
      className="border-border-subtle flex flex-wrap items-center gap-2 border-b py-1 last:border-b-0"
    >
      <form action={toggleAction} ref={formRef} className="min-w-0 flex-1">
        <input type="hidden" name="planId" value={planId} />
        <input type="hidden" name="itemId" value={item.id} />

        {/* O alvo de toque é o label inteiro, não o quadrado. */}
        <label className="flex min-h-12 cursor-pointer items-center gap-3 py-1">
          <input
            ref={checkboxRef}
            className="check-control"
            type="checkbox"
            name="done"
            defaultChecked={marcado}
            disabled={readOnly || togglePending}
            onChange={() => formRef.current?.requestSubmit()}
          />
          <span className="flex min-w-0 flex-col">
            <span
              className={cn(
                "type-body-s break-words",
                marcado && "text-text-muted line-through",
              )}
            >
              {item.label}
            </span>
            {marcado && item.doneByName ? (
              <span className="type-meta text-text-muted">
                {item.doneByName}
                {item.doneAt ? `, ${formatRelativeDay(item.doneAt, now)}` : ""}
              </span>
            ) : null}
          </span>
        </label>
      </form>

      {readOnly ? null : (
        <div className="flex shrink-0 items-center">
          <form action={moveAction}>
            <input type="hidden" name="planId" value={planId} />
            <input type="hidden" name="itemId" value={item.id} />
            <IconButton
              type="submit"
              name="direction"
              value="up"
              label={`Subir ${item.label}`}
              disabled={isFirst || movePending}
              icon={<ChevronUp aria-hidden="true" className="size-4" />}
            />
          </form>
          <form action={moveAction}>
            <input type="hidden" name="planId" value={planId} />
            <input type="hidden" name="itemId" value={item.id} />
            <IconButton
              type="submit"
              name="direction"
              value="down"
              label={`Descer ${item.label}`}
              disabled={isLast || movePending}
              icon={<ChevronDown aria-hidden="true" className="size-4" />}
            />
          </form>
          <form action={deleteAction}>
            <input type="hidden" name="planId" value={planId} />
            <input type="hidden" name="itemId" value={item.id} />
            <IconButton
              type="submit"
              label={`Apagar ${item.label}`}
              disabled={deletePending}
              icon={<Trash2 aria-hidden="true" className="size-4" />}
            />
          </form>
        </div>
      )}

      {(toggleState.error ?? moveState.error ?? deleteState.error) ? (
        <p role="alert" className="type-meta text-danger basis-full">
          {toggleState.error ?? moveState.error ?? deleteState.error}
        </p>
      ) : null}
    </li>
  );
}

/** Acrescentar item: uma linha, embutida, sem modal. */
export function AddChecklistItemForm({ planId }: { planId: string }) {
  const [state, formAction, pending] = useActionState(
    addChecklistItemAction,
    INITIAL,
  );
  const formRef = useRef<HTMLFormElement>(null);

  // Limpa o campo ao salvar, para o próximo item entrar direto.
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form
      action={formAction}
      ref={formRef}
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
    >
      <input type="hidden" name="planId" value={planId} />
      <Input
        label="Novo item"
        name="label"
        className="flex-1"
        placeholder="Levar guarda-chuva"
      />
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        loading={pending}
        loadingLabel="Salvando"
      >
        <Plus aria-hidden="true" className="size-4" />
        Acrescentar
      </Button>

      {state.error ? (
        <p role="alert" className="type-body-s text-danger sm:w-full">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
