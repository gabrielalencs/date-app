"use client";

import { useActionState, useState } from "react";
import { Bookmark, Link as LinkIcon, Lightbulb, Shapes } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Input, SelectField } from "@/components/ui/field";
import {
  createPlanAction,
  type ActionState,
} from "@/features/plans/actions/plan-actions";
import { CATEGORY_OPTIONS } from "@/lib/categories";

const INITIAL: ActionState = {};

export function NewPlanForm() {
  const [state, formAction, pending] = useActionState(
    createPlanAction,
    INITIAL,
  );
  const [title, setTitle] = useState("");
  return (
    <form action={formAction} className="panel flex flex-col gap-7">
      <div className="border-border-subtle flex items-center justify-between gap-3 border-b pb-5">
        <h2 className="section-heading">Uma boa ideia começa aqui.</h2>
        <Bookmark
          className="text-text-muted size-5 shrink-0"
          aria-hidden="true"
        />
      </div>
      <div>
        <Input
          label="Título"
          icon={Lightbulb}
          name="title"
          required
          maxLength={200}
          placeholder="Ex.: Jantar a dois"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <div className="type-meta text-text-muted mt-2 flex justify-between gap-4">
          <span>Um nome para lembrar depois.</span>
          <span className="tnum">{title.length}/200</span>
        </div>
      </div>
      <SelectField
        label="Categoria"
        icon={Shapes}
        name="category"
        required
        defaultValue="gastronomia"
      >
        {CATEGORY_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </SelectField>
      <Input
        label="Link de origem"
        icon={LinkIcon}
        name="sourceUrl"
        type="url"
        hint="Opcional. O post, o site ou o mapa de onde veio a ideia."
        placeholder="https://"
      />
      <p className="type-body-s text-text-muted bg-mist-soft rounded-md p-4">
        Salve a vontade agora. Fotos, local e outros detalhes podem vir depois.
      </p>
      {state.error ? (
        <p role="alert" className="type-body-s text-danger">
          {state.error}
        </p>
      ) : null}
      <div className="border-border-subtle flex flex-wrap justify-end gap-3 border-t pt-5">
        <ButtonLink href="/ideias" variant="ghost" size="sm">
          Cancelar
        </ButtonLink>
        <Button
          type="submit"
          variant="accent"
          loading={pending}
          loadingLabel="Salvando"
        >
          <Bookmark aria-hidden="true" className="size-4" />
          Salvar ideia
        </Button>
      </div>
    </form>
  );
}
