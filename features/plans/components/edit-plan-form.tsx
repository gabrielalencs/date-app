"use client";

import { useActionState } from "react";
import { MapPin, Shapes, Bookmark, Wallet, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea, SelectField } from "@/components/ui/field";
import {
  updatePlanAction,
  type ActionState,
} from "@/features/plans/actions/plan-actions";
import { CATEGORY_OPTIONS, toCategory } from "@/lib/categories";
import type { Plan } from "@/features/plans/data/queries";
import { centsToInputValue } from "@/lib/money";

const INITIAL: ActionState = {};
export function EditPlanForm({ plan }: { plan: Plan }) {
  const [state, formAction, pending] = useActionState(
    updatePlanAction,
    INITIAL,
  );
  return (
    <form action={formAction} className="flex flex-col gap-8">
      <input type="hidden" name="planId" value={plan.id} />
      <fieldset className="flex min-w-0 flex-col gap-5">
        <legend className="type-label text-text-muted mb-5">
          Sobre a ideia
        </legend>
        <Input
          label="Título"
          name="title"
          defaultValue={plan.title}
          required
          maxLength={200}
        />
        <SelectField
          label="Categoria"
          icon={Shapes}
          name="category"
          defaultValue={toCategory(plan.category)}
        >
          {CATEGORY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>
        <Textarea
          label="Descrição"
          name="description"
          defaultValue={plan.description ?? ""}
          rows={3}
          placeholder="O que faz esse plano especial?"
        />
      </fieldset>
      <fieldset className="border-border-subtle grid min-w-0 gap-5 border-t pt-5 sm:grid-cols-2">
        <legend className="type-label text-text-muted pr-3">Os detalhes</legend>
        <Input
          label="Local"
          icon={MapPin}
          name="placeName"
          defaultValue={plan.placeName ?? ""}
        />
        <Input label="Cidade" name="city" defaultValue={plan.city ?? ""} />
        <Input label="Estado" name="state" defaultValue={plan.state ?? ""} />
        <Input
          label="Orçamento estimado"
          icon={Wallet}
          name="estimatedBudgetCents"
          type="text"
          inputMode="decimal"
          defaultValue={centsToInputValue(plan.estimatedBudgetCents)}
          hint="Em reais. Deixe vazio se ainda não sabem."
        />
      </fieldset>
      <SelectField
        label="Prioridade"
        icon={Flag}
        name="priority"
        defaultValue={String(plan.priority)}
      >
        <option value="0">Sem prioridade</option>
        <option value="1">Baixa</option>
        <option value="2">Média</option>
        <option value="3">Alta</option>
      </SelectField>
      <label className="bg-surface-soft flex min-h-12 cursor-pointer items-center gap-3 rounded-md p-4">
        <input
          type="checkbox"
          name="requiresBooking"
          defaultChecked={plan.requiresBooking}
          className="check-control"
        />
        <span className="type-body">Precisa de reserva</span>
      </label>
      <Textarea
        label="Observações"
        name="notes"
        defaultValue={plan.notes ?? ""}
        rows={3}
        placeholder="Algo mais para lembrar?"
      />
      {state.error ? (
        <p role="alert" className="type-body-s text-danger">
          {state.error}
        </p>
      ) : null}
      <div className="border-border-subtle flex flex-wrap items-center justify-end gap-3 border-t pt-5">
        {state !== INITIAL && !state.error ? (
          <p role="status" className="type-body-s">
            Alterações salvas.
          </p>
        ) : null}
        <Button
          type="submit"
          variant="primary"
          loading={pending}
          loadingLabel="Salvando"
        >
          <Bookmark aria-hidden="true" className="size-4" />
          Salvar alterações
        </Button>
      </div>
    </form>
  );
}
