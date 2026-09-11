"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import {
  updatePlanAction,
  type ActionState,
} from "@/features/plans/actions/plan-actions";
import { CATEGORY_OPTIONS, toCategory } from "@/lib/categories";
import type { Plan } from "@/features/plans/data/queries";

const INITIAL: ActionState = {};

const SELECT =
  "min-h-11 w-full rounded-sm border border-border-strong bg-surface px-3 type-body text-text";

/** Centavos viram texto editável; o servidor converte de volta (D-025). */
function centsToInput(value: number | null): string {
  return value === null ? "" : (value / 100).toFixed(2);
}

export function EditPlanForm({ plan }: { plan: Plan }) {
  const [state, formAction, pending] = useActionState(
    updatePlanAction,
    INITIAL,
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="planId" value={plan.id} />

      <Input label="Título" name="title" defaultValue={plan.title} required />

      <div className="flex flex-col gap-2">
        <label
          htmlFor="editar-categoria"
          className="type-label text-text-muted"
        >
          Categoria
        </label>
        <select
          id="editar-categoria"
          name="category"
          defaultValue={toCategory(plan.category)}
          className={SELECT}
        >
          {CATEGORY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <Textarea
        label="Descrição"
        name="description"
        defaultValue={plan.description ?? ""}
        rows={3}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <Input
          label="Local"
          name="placeName"
          defaultValue={plan.placeName ?? ""}
        />
        <Input label="Cidade" name="city" defaultValue={plan.city ?? ""} />
        <Input label="Estado" name="state" defaultValue={plan.state ?? ""} />
        <Input
          label="Orçamento estimado"
          name="estimatedBudgetCents"
          inputMode="decimal"
          defaultValue={centsToInput(plan.estimatedBudgetCents)}
          hint="Em reais. Deixe vazio se ainda não sabem."
        />
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor="editar-prioridade"
          className="type-label text-text-muted"
        >
          Prioridade
        </label>
        <select
          id="editar-prioridade"
          name="priority"
          defaultValue={String(plan.priority)}
          className={SELECT}
        >
          <option value="0">Sem prioridade</option>
          <option value="1">Baixa</option>
          <option value="2">Média</option>
          <option value="3">Alta</option>
        </select>
      </div>

      <label className="flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          name="requiresBooking"
          defaultChecked={plan.requiresBooking}
          className="size-5 accent-[var(--accent)]"
        />
        <span className="type-body text-text">Precisa de reserva</span>
      </label>

      <Textarea
        label="Observações"
        name="notes"
        defaultValue={plan.notes ?? ""}
        rows={3}
      />

      {state.error ? (
        <p role="alert" className="type-body-s text-danger">
          {state.error}
        </p>
      ) : null}

      <Button
        type="submit"
        variant="primary"
        loading={pending}
        loadingLabel="Salvando"
      >
        Salvar alterações
      </Button>
    </form>
  );
}
