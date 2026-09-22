"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ButtonVariant } from "@/lib/button-variants";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { EditPlanForm } from "@/features/plans/components/edit-plan-form";
import type { Plan } from "@/features/plans/data/queries";

/**
 * O formulário de detalhes numa gaveta, em vez de numa sanfona no fim da
 * página.
 *
 * O `<details>` anterior tinha dois problemas no telefone, e os dois eram do
 * formato: abrir empurrava tudo o que vinha depois para longe, e o formulário
 * abria **onde a sanfona estava** — no fim de tudo, depois de seis seções. A
 * gaveta sobe por cima, ocupa a altura que precisa, prende o foco enquanto está
 * aberta e devolve a página exatamente onde estava ao fechar.
 *
 * `SheetContent` já vira painel lateral a partir do `sm`, então é o mesmo
 * componente nos dois tamanhos — não há um caminho de mobile e outro de
 * desktop para manter em pé.
 */
export function EditPlanSheet({
  plan,
  label = "Editar detalhes",
  variant = "secondary",
}: {
  plan: Plan;
  label?: string;
  variant?: ButtonVariant;
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <Sheet open={aberto} onOpenChange={setAberto}>
      <SheetTrigger asChild>
        <Button type="button" variant={variant} size="sm">
          <Pencil aria-hidden="true" className="size-4" />
          {label}
        </Button>
      </SheetTrigger>
      <SheetContent
        title="Editar detalhes"
        description="Tudo o que descreve o plano. Nada aqui é obrigatório."
      >
        <EditPlanForm plan={plan} onSaved={() => setAberto(false)} />
      </SheetContent>
    </Sheet>
  );
}
