"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import {
  createPlanAction,
  type ActionState,
} from "@/features/plans/actions/plan-actions";
import { CATEGORY_OPTIONS } from "@/lib/categories";

const INITIAL: ActionState = {};

/**
 * Cadastro rápido: título e categoria bastam. Um formulário de quinze campos
 * na criação é o que faz ninguém criar nada — o resto se edita no detalhe.
 */
export function NewPlanForm() {
  const [state, formAction, pending] = useActionState(
    createPlanAction,
    INITIAL,
  );

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-5">
      <Input
        label="Título"
        name="title"
        required
        autoFocus
        maxLength={200}
        placeholder="Cantina da esquina"
      />

      <div className="flex flex-col gap-2">
        <label htmlFor="novo-categoria" className="type-label text-text-muted">
          Categoria
        </label>
        <select
          id="novo-categoria"
          name="category"
          required
          defaultValue="gastronomia"
          className="border-border-strong bg-surface type-body text-text min-h-11 w-full rounded-sm border px-3"
        >
          {CATEGORY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <Input
        label="Link de origem"
        name="sourceUrl"
        type="url"
        hint="Opcional. O post, o site ou o mapa de onde veio a ideia."
        placeholder="https://"
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
        Salvar ideia
      </Button>
    </form>
  );
}
