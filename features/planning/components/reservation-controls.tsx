"use client";

import { useActionState, useState } from "react";
import { Check, PencilLine, Undo2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import {
  saveReservationAction,
  setReservationStatusAction,
  type ActionState,
} from "@/features/planning/actions/planning-actions";
import type { Reservation } from "@/features/planning/data/queries";

const INITIAL: ActionState = {};

/**
 * Confirmar e desfazer a reserva.
 *
 * É este botão que move o plano: confirmar em `planned` leva a `reserved`, e
 * desfazer traz de volta. O botão de status **não** faz o caminho de volta, e é
 * de propósito — quem desfaz reserva é a reserva.
 */
export function ReservationStatusControl({
  planId,
  status,
}: {
  planId: string;
  status: Reservation["status"];
}) {
  const [state, formAction, pending] = useActionState(
    setReservationStatusAction,
    INITIAL,
  );

  return (
    <div className="flex flex-col gap-3">
      <form action={formAction} className="flex flex-wrap gap-2">
        <input type="hidden" name="planId" value={planId} />

        {status === "confirmed" ? (
          <>
            <Button
              type="submit"
              name="status"
              value="pending"
              variant="outline"
              size="sm"
              loading={pending}
              loadingLabel="Desfazendo"
            >
              <Undo2 aria-hidden="true" className="size-4" />
              Desfazer reserva
            </Button>
            <Button
              type="submit"
              name="status"
              value="cancelled"
              variant="ghost"
              size="sm"
              loading={pending}
              loadingLabel="Cancelando"
            >
              <X aria-hidden="true" className="size-4" />
              Não deu certo
            </Button>
          </>
        ) : (
          <>
            <Button
              type="submit"
              name="status"
              value="confirmed"
              variant="primary"
              size="sm"
              loading={pending}
              loadingLabel="Confirmando"
            >
              <Check aria-hidden="true" className="size-4" />
              Confirmar reserva
            </Button>
            {status === "pending" ? (
              <Button
                type="submit"
                name="status"
                value="cancelled"
                variant="ghost"
                size="sm"
                loading={pending}
                loadingLabel="Cancelando"
              >
                <X aria-hidden="true" className="size-4" />
                Não deu certo
              </Button>
            ) : null}
            {status === "cancelled" ? (
              <Button
                type="submit"
                name="status"
                value="pending"
                variant="ghost"
                size="sm"
                loading={pending}
                loadingLabel="Reabrindo"
              >
                Tentar de novo
              </Button>
            ) : null}
          </>
        )}
      </form>

      {state.error ? (
        <p role="alert" className="type-body-s text-danger">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Código, horário, link e observações.
 *
 * Formulário embutido, nunca modal: modal é só para confirmação destrutiva
 * (D-080). Começa fechado quando já há algo salvo, para o que importa — o
 * código e o horário — ficar visível sem competir com os campos.
 */
export function ReservationForm({
  planId,
  reservation,
}: {
  planId: string;
  reservation: Reservation | null;
}) {
  const [state, formAction, pending] = useActionState(
    saveReservationAction,
    INITIAL,
  );
  const [aberto, setAberto] = useState(reservation === null);

  /* Fecha ao salvar. Ajuste durante a renderização, e não em efeito: é o padrão
     que o React documenta para reagir a uma mudança de estado externo. */
  const [ultimoResultado, setUltimoResultado] = useState(state);

  if (state !== ultimoResultado) {
    setUltimoResultado(state);
    if (state.ok && reservation !== null) setAberto(false);
  }

  if (!aberto) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-fit"
        onClick={() => setAberto(true)}
      >
        <PencilLine aria-hidden="true" className="size-4" />
        Editar dados da reserva
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="planId" value={planId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Código"
          name="code"
          defaultValue={reservation?.code ?? ""}
          hint="O localizador, o número da mesa."
        />
        <Input
          label="Horário"
          name="reservedTime"
          type="time"
          /* O banco guarda `time`, que volta como "20:30:00"; o input quer
             "20:30". O dia não entra aqui: ele é o da data confirmada. */
          defaultValue={reservation?.reservedTime?.slice(0, 5) ?? ""}
          hint="Só a hora. O dia é o da data confirmada."
        />
      </div>

      <Input
        label="Link"
        name="url"
        inputMode="url"
        defaultValue={reservation?.url ?? ""}
        hint="A página da reserva, se houver."
      />

      <Textarea
        label="Observações"
        name="notes"
        rows={3}
        defaultValue={reservation?.notes ?? ""}
        hint="O que mais precisam lembrar sobre essa reserva."
      />

      {state.error ? (
        <p role="alert" className="type-body-s text-danger">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          loading={pending}
          loadingLabel="Salvando"
        >
          Salvar reserva
        </Button>
        {reservation !== null ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setAberto(false)}
          >
            Cancelar
          </Button>
        ) : null}
      </div>
    </form>
  );
}
