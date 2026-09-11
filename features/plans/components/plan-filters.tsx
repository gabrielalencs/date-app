import { ArrowDownWideNarrow, Shapes, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/field";
import { CATEGORY_OPTIONS, type Category } from "@/lib/categories";
import { PLAN_STATUSES, statusLabel, type PlanStatus } from "@/lib/status";

/** Filtros GET existentes, com Select DATE compartilhado com os formulários. */
export function PlanFilters({
  status,
  category,
  sort,
}: {
  status: PlanStatus | "open";
  category?: Category;
  sort: "recent" | "priority" | "budget";
}) {
  return (
    <form
      method="get"
      className="border-border-subtle grid items-end gap-4 border-y py-5 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_auto]"
    >
      <SelectField label="Status" name="status" defaultValue={status}>
        <option value="open">Em aberto</option>
        {PLAN_STATUSES.map((value) => (
          <option key={value} value={value}>
            {statusLabel(value)}
          </option>
        ))}
      </SelectField>
      <SelectField
        label="Categoria"
        icon={Shapes}
        name="categoria"
        defaultValue={category ?? ""}
      >
        <option value="">Todas</option>
        {CATEGORY_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </SelectField>
      <SelectField
        label="Ordem"
        icon={ArrowDownWideNarrow}
        name="ordem"
        defaultValue={sort}
      >
        <option value="recent">Mais recentes</option>
        <option value="priority">Prioridade</option>
        <option value="budget">Orçamento</option>
      </SelectField>
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        className="min-h-[3.25rem]"
      >
        <SlidersHorizontal aria-hidden="true" className="size-4" />
        Filtrar
      </Button>
    </form>
  );
}
