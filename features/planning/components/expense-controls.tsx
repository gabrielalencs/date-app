"use client";

import { useActionState, useEffect, useRef } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input, SelectField } from "@/components/ui/field";
import {
  addExpenseAction,
  deleteExpenseAction,
  type ActionState,
} from "@/features/planning/actions/planning-actions";
import type { ExpenseEntry } from "@/features/planning/data/queries";
import { formatCents } from "@/lib/money";

const INITIAL: ActionState = {};

export function ExpenseRow({
  planId,
  expense,
  readOnly,
}: {
  planId: string;
  expense: ExpenseEntry;
  readOnly: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    deleteExpenseAction,
    INITIAL,
  );

  return (
    <li
      data-expense={expense.id}
      className="border-border-subtle flex flex-wrap items-center gap-3 border-b py-2 last:border-b-0"
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="type-body-s break-words">{expense.label}</span>
        {expense.paidByName ? (
          <span className="type-meta text-text-muted">
            Pagou: {expense.paidByName}
          </span>
        ) : null}
      </span>

      {/* Coluna de valor alinhada à direita, em tabular. Número que não alinha
          é o que mais rápido faz um produto parecer amador. */}
      <span
        data-expense-amount={expense.amountCents}
        className="type-body-s tnum shrink-0 text-right"
      >
        {formatCents(expense.amountCents)}
      </span>

      {readOnly ? null : (
        <form action={formAction} className="shrink-0">
          <input type="hidden" name="planId" value={planId} />
          <input type="hidden" name="expenseId" value={expense.id} />
          <IconButton
            type="submit"
            label={`Apagar ${expense.label}`}
            disabled={pending}
            icon={<Trash2 aria-hidden="true" className="size-4" />}
          />
        </form>
      )}

      {state.error ? (
        <p role="alert" className="type-meta text-danger basis-full">
          {state.error}
        </p>
      ) : null}
    </li>
  );
}

/**
 * Lançar um gasto.
 *
 * O campo de valor é `type="text"` com `inputMode="decimal"` — **nunca**
 * `type="number"`, que em pt-BR recusa a vírgula que o teclado do celular
 * oferece e devolve string vazia. O `Input` do design system não passa `type`
 * por padrão, então text é o que sai.
 */
export function AddExpenseForm({
  planId,
  members,
}: {
  planId: string;
  members: readonly { profileId: string; displayName: string }[];
}) {
  const [state, formAction, pending] = useActionState(
    addExpenseAction,
    INITIAL,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form action={formAction} ref={formRef} className="flex flex-col gap-4">
      <input type="hidden" name="planId" value={planId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="No que foi" name="label" placeholder="Jantar" />
        <Input
          label="Valor"
          name="amountCents"
          type="text"
          inputMode="decimal"
          placeholder="80,50"
          hint="Em reais. Pode usar vírgula."
        />
      </div>

      {members.length > 0 ? (
        <SelectField
          label="Quem pagou"
          name="paidBy"
          hint="Opcional. É só registro, não é acerto de contas."
        >
          <option value="">Não registrar</option>
          {members.map((member) => (
            <option key={member.profileId} value={member.profileId}>
              {member.displayName}
            </option>
          ))}
        </SelectField>
      ) : null}

      {state.error ? (
        <p role="alert" className="type-body-s text-danger">
          {state.error}
        </p>
      ) : null}

      <Button
        type="submit"
        variant="secondary"
        size="sm"
        className="w-fit"
        loading={pending}
        loadingLabel="Salvando"
      >
        <Plus aria-hidden="true" className="size-4" />
        Lançar gasto
      </Button>
    </form>
  );
}
