import { Button } from "@/components/ui/button";
import { CATEGORY_OPTIONS, type Category } from "@/lib/categories";
import { PLAN_STATUSES, statusLabel, type PlanStatus } from "@/lib/status";

/**
 * Form GET: filtra pela própria URL, sem estado no cliente e sem JavaScript
 * (D-039). O botão "Filtrar" é o que submete; quem tem JS não perde nada.
 */
const SELECT =
  "min-h-11 rounded-sm border border-border-strong bg-surface px-3 type-body-s text-text";

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
      className="border-border-subtle flex flex-wrap items-end gap-3 border-y py-4"
    >
      <div className="flex flex-col gap-2">
        <label htmlFor="filtro-status" className="type-label text-text-muted">
          Status
        </label>
        <select
          id="filtro-status"
          name="status"
          defaultValue={status}
          className={SELECT}
        >
          <option value="open">Em aberto</option>
          {PLAN_STATUSES.map((value) => (
            <option key={value} value={value}>
              {statusLabel(value)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor="filtro-categoria"
          className="type-label text-text-muted"
        >
          Categoria
        </label>
        <select
          id="filtro-categoria"
          name="categoria"
          defaultValue={category ?? ""}
          className={SELECT}
        >
          <option value="">Todas</option>
          {CATEGORY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="filtro-ordem" className="type-label text-text-muted">
          Ordem
        </label>
        <select
          id="filtro-ordem"
          name="ordem"
          defaultValue={sort}
          className={SELECT}
        >
          <option value="recent">Mais recentes</option>
          <option value="priority">Prioridade</option>
          <option value="budget">Orçamento</option>
        </select>
      </div>

      <Button type="submit" variant="secondary" size="sm">
        Filtrar
      </Button>
    </form>
  );
}
