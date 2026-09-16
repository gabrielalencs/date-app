import {
  ArrowDownWideNarrow,
  Bookmark,
  MapPin,
  Shapes,
  SlidersHorizontal,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, SelectField } from "@/components/ui/field";
import { CATEGORY_OPTIONS, type Category } from "@/lib/categories";
import { PLAN_STATUSES, statusLabel, type PlanStatus } from "@/lib/status";

/** Filtros GET existentes, com Select DATE compartilhado com os formulários. */
export function PlanFilters({
  status,
  category,
  sort,
  city,
  maxBudgetInput,
  favoritesOnly,
}: {
  status: PlanStatus | "open";
  category?: Category;
  sort: "recent" | "priority" | "budget";
  city?: string;
  maxBudgetInput: string;
  favoritesOnly: boolean;
}) {
  return (
    <form
      method="get"
      className="border-border-subtle grid items-end gap-4 border-y py-5 sm:grid-cols-2 xl:grid-cols-3"
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
      <Input
        label="Cidade"
        icon={MapPin}
        name="cidade"
        defaultValue={city}
        maxLength={120}
        placeholder="Ex.: São Paulo"
      />
      <Input
        label="Até quanto"
        icon={Wallet}
        name="teto"
        inputMode="decimal"
        defaultValue={maxBudgetInput}
        placeholder="Ex.: 250,00"
      />
      <label className="border-border-subtle bg-surface-soft flex min-h-[3.25rem] items-center gap-3 rounded-sm border px-4 text-sm font-medium">
        <input
          className="check-control"
          type="checkbox"
          name="favoritos"
          value="1"
          defaultChecked={favoritesOnly}
        />
        <Bookmark aria-hidden="true" className="size-4" />
        Meus favoritos
      </label>
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
