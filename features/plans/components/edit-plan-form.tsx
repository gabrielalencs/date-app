"use client";

import { useActionState, useState } from "react";
import {
  MapPin,
  Shapes,
  Bookmark,
  Wallet,
  Flag,
  Link as LinkIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea, SelectField } from "@/components/ui/field";
import {
  updatePlanAction,
  type ActionState,
} from "@/features/plans/actions/plan-actions";
import { CoverControl } from "@/features/media/components/cover-control";
import { CATEGORY_OPTIONS, toCategory } from "@/lib/categories";
import type { Plan } from "@/features/plans/data/queries";
import { centsToInputValue } from "@/lib/money";

const INITIAL: ActionState = {};

export function EditPlanForm({
  plan,
  onSaved,
}: {
  plan: Plan;
  /** Quem abriu o formulário numa gaveta quer que ela feche ao salvar. */
  onSaved?: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    updatePlanAction,
    INITIAL,
  );

  /* Ajuste durante a renderização, o mesmo padrão do formulário de datas: o
     React documenta isto para reagir a estado externo sem o render extra que um
     efeito produziria. */
  const [ultimoResultado, setUltimoResultado] = useState(state);

  if (state !== ultimoResultado) {
    setUltimoResultado(state);
    if (state !== INITIAL && !state.error) {
      onSaved?.();
    }
  }

  return (
    <form action={formAction} className="flex flex-col gap-8">
      <input type="hidden" name="planId" value={plan.id} />

      {/* A capa primeiro, porque e a primeira linha de "Complete a ideia" e a
          primeira coisa que a pagina mostra. Fora do <fieldset> e fora do
          fluxo de salvar: ela grava sozinha, no instante do upload, e nao
          depende do botao la embaixo. */}
      <div className="border-border-subtle border-b pb-6">
        <CoverControl planId={plan.id} coverMediaId={plan.coverMediaId} />
      </div>

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
        {/* Um campo de lugar, nao tres.

            Cidade e Estado saiam do R3: sao duas pessoas, uma cidade, e o que
            elas escrevem quando pensam "onde" e o bairro ou o nome da casa —
            nunca "Ceara". Dois campos que ninguem preenche viram duas linhas
            vazias na ficha e uma sensacao de formulario inacabado. As colunas
            continuam no banco com o que ja foi gravado; o produto e que parou
            de perguntar. */}
        <Input
          label="Local"
          icon={MapPin}
          name="placeName"
          defaultValue={plan.placeName ?? ""}
          placeholder="Bairro, casa, endereco curto"
          hint="Onde e. O bairro ja basta."
        />
        {/* O link de origem era aceito só no cadastro e depois não existia em
            lugar nenhum: gravado, nunca mostrado, impossível de corrigir.
 
            O `className` do Input vai para o <input>, não para o invólucro —
            então a largura dupla mora numa div, e não no campo. */}
        <div className="min-w-0 sm:col-span-2">
          <Input
            label="Link de referência"
            icon={LinkIcon}
            name="sourceUrl"
            type="url"
            inputMode="url"
            defaultValue={plan.sourceUrl ?? ""}
            placeholder="https://"
            hint="O post, o site ou o mapa de onde veio a ideia."
          />
        </div>
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
