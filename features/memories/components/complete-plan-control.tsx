"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  completePlanAction,
  type ActionState,
} from "@/features/memories/actions/memory-actions";

const INITIAL: ActionState = {};

/**
 * Marcar o date como realizado — a ação mais séria do produto.
 *
 * Irreversível, então passa por confirmação em modal: o **segundo** uso
 * sancionado do modal neste produto, ao lado da remoção de foto. O texto diz
 * que não tem volta, em português de gente e sem drama.
 *
 * O botão só existe quando as pré-condições permitem, e quem decide isso é
 * `offerableTransitions` — a mesma função que a mutation consulta de novo
 * dentro da transação. A tela não oferecer o que seria recusado é a primeira
 * das duas consultas; a segunda é que garante, porque um POST forjado não
 * passa por modal nenhum.
 */
export function CompletePlanControl({ planId }: { planId: string }) {
  const [state, formAction, pending] = useActionState(
    completePlanAction,
    INITIAL,
  );

  /* Modal não controlado, de propósito. Não há `useState` para fechar depois
     do sucesso porque não é preciso: a action revalida a rota, o plano volta
     como `completed`, `offerableTransitions` deixa de oferecer a travessia e
     este controle inteiro sai da árvore — o modal vai junto. Fechar à mão em
     `useEffect` seria um setState em efeito, que o lint recusa com razão.
     Quando a action falha, nada fecha o modal, que é justamente onde o erro
     precisa ser lido. */
  return (
    <div className="flex flex-col gap-2">
      <Dialog>
        <DialogTrigger asChild>
          <Button type="button" variant="primary" size="sm">
            <CheckCircle2 aria-hidden="true" className="size-4" />
            Marcar como realizado
          </Button>
        </DialogTrigger>

        <DialogContent
          title="Marcar como realizado?"
          description="Depois disso o plano sai das ideias e passa a viver nas memórias. Não dá para voltar atrás — mas vocês ainda vão poder avaliar, subir fotos e lançar os gastos."
        >
          <form action={formAction} className="flex flex-col gap-4">
            <input type="hidden" name="planId" value={planId} />

            {state.error ? (
              <p role="alert" className="type-body-s text-danger">
                {state.error}
              </p>
            ) : null}

            <div className="flex flex-wrap justify-end gap-3">
              <DialogClose asChild>
                <Button type="button" variant="secondary" disabled={pending}>
                  Ainda não
                </Button>
              </DialogClose>
              <Button
                type="submit"
                variant="primary"
                loading={pending}
                loadingLabel="Marcando"
              >
                Sim, aconteceu
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {state.error ? (
        <p role="alert" className="type-meta text-danger">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
