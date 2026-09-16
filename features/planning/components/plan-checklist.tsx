import { ListChecks } from "lucide-react";

import {
  AddChecklistItemForm,
  ChecklistRow,
} from "@/features/planning/components/checklist-controls";
import type { ChecklistEntry } from "@/features/planning/data/queries";

/**
 * O checklist.
 *
 * Vazio, aparece como uma linha e o campo de acrescentar — nunca como bloco
 * vazio com borda tracejada (seção 9). Três caixas vazias empilhadas seriam o
 * "cards por todo lado sem hierarquia" que o spec proíbe.
 */
export function PlanChecklist({
  planId,
  items,
  now,
  readOnly,
}: {
  planId: string;
  items: readonly ChecklistEntry[];
  now: Date;
  readOnly: boolean;
}) {
  // Em plano cancelado ou arquivado sem itens, a seção não tem o que mostrar.
  if (readOnly && items.length === 0) return null;

  const marcados = items.filter((item) => item.doneAt !== null).length;

  return (
    <section className="panel flex flex-col gap-5" aria-label="Checklist">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="section-heading flex items-center gap-3">
          <ListChecks aria-hidden="true" className="size-5" strokeWidth={1.5} />
          Checklist
        </h2>
        {items.length > 0 ? (
          <span data-checklist-count className="type-meta text-text-muted tnum">
            {marcados} de {items.length}
          </span>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="type-body-s text-text-muted">
          Nada anotado ainda. O que vocês não podem esquecer de levar?
        </p>
      ) : (
        <ul className="flex flex-col">
          {items.map((item, index) => (
            <ChecklistRow
              key={item.id}
              planId={planId}
              item={item}
              now={now}
              readOnly={readOnly}
              isFirst={index === 0}
              isLast={index === items.length - 1}
            />
          ))}
        </ul>
      )}

      {readOnly ? null : <AddChecklistItemForm planId={planId} />}
    </section>
  );
}
