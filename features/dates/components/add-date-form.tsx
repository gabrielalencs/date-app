"use client";

import { useActionState, useState } from "react";
import { CalendarPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import {
  createDateOptionAction,
  type ActionState,
} from "@/features/dates/actions/date-actions";

const INITIAL: ActionState = {};

/**
 * Sugerir uma data: dia obrigatório, horário opcional, alternador de dia
 * inteiro, observação opcional (seção 9).
 *
 * O formulário começa fechado. Aberto por padrão, ele empurraria a lista de
 * datas para baixo da dobra justamente quando ela é o que importa olhar.
 *
 * O horário some quando "dia inteiro" está ligado, em vez de ficar desabilitado:
 * campo desabilitado é uma pergunta que a tela faz e não deixa responder.
 */
export function AddDateForm({ planId }: { planId: string }) {
  const [state, formAction, pending] = useActionState(
    createDateOptionAction,
    INITIAL,
  );
  const [aberto, setAberto] = useState(false);
  const [diaInteiro, setDiaInteiro] = useState(false);

  /* Fecha ao salvar. Deixar aberto com os valores antigos faria a tela parecer
     que não salvou, e o botão de sugerir some enquanto o formulário ocupa o
     lugar dele. Fechar também limpa os campos, porque desmonta.

     Ajuste durante a renderização, e não em efeito: é o padrão que o React
     documenta para reagir a uma mudança de estado externo, e evita o render
     extra com a tela na posição errada. */
  const [ultimoResultado, setUltimoResultado] = useState(state);

  if (state !== ultimoResultado) {
    setUltimoResultado(state);
    if (state.ok) {
      setAberto(false);
      setDiaInteiro(false);
    }
  }

  if (!aberto) {
    return (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setAberto(true)}
      >
        <CalendarPlus aria-hidden="true" className="size-4" />
        Sugerir data
      </Button>
    );
  }

  return (
    <form
      action={formAction}
      className="border-border-subtle bg-surface flex flex-col gap-4 rounded-lg border p-4"
    >
      <input type="hidden" name="planId" value={planId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Dia" name="date" type="date" required />

        {diaInteiro ? null : (
          <Input
            label="Horário"
            name="time"
            type="time"
            className="tnum"
            hint="Opcional."
          />
        )}
      </div>

      {/* A área de toque cresce por padding invisível no label, não pelo quadrado. */}
      <label className="flex min-h-11 cursor-pointer items-center gap-3 py-2">
        <input
          type="checkbox"
          name="allDay"
          checked={diaInteiro}
          onChange={(event) => setDiaInteiro(event.target.checked)}
          className="check-control"
        />
        <span className="type-body text-text">Dia inteiro</span>
      </label>

      <Input
        label="Observação"
        name="note"
        type="text"
        maxLength={280}
        placeholder="Sessão das 19h, chegar cedo…"
        hint="Opcional."
      />

      {state.error ? (
        <p role="alert" className="type-body-s text-danger">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          variant="primary"
          loading={pending}
          loadingLabel="Salvando"
        >
          Salvar data
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setAberto(false)}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
