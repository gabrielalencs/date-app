"use client";

import { useActionState } from "react";
import { Shuffle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  choosePlanAction,
  type RandomizerActionState,
} from "@/features/discovery/actions/discovery-actions";
import type { DiscoveryFilters } from "@/features/discovery/filters";

const INITIAL: RandomizerActionState = {};

export function PlanRandomizer({
  filters,
  maxBudgetInput,
}: {
  filters: DiscoveryFilters;
  maxBudgetInput: string;
}) {
  const [state, formAction, pending] = useActionState(
    choosePlanAction,
    INITIAL,
  );

  return (
    <div className="bg-mist-soft flex flex-col items-start justify-between gap-4 rounded-lg p-5 sm:flex-row sm:items-center">
      <div>
        <h2 className="type-heading">Escolhe pra gente</h2>
        <p className="type-body-s text-text-muted mt-1">
          Um plano entre os filtros que já estão na tela.
        </p>
        {state.message ? (
          <p role="status" className="type-body-s mt-2">
            {state.message}
          </p>
        ) : null}
      </div>
      <form action={formAction}>
        <input type="hidden" name="status" value={filters.status} />
        <input type="hidden" name="category" value={filters.category ?? ""} />
        <input type="hidden" name="sort" value={filters.sort} />
        <input type="hidden" name="maxBudget" value={maxBudgetInput} />
        <input
          type="hidden"
          name="favorites"
          value={filters.favoritesOnly ? "1" : ""}
        />
        <Button
          type="submit"
          variant="primary"
          size="sm"
          loading={pending}
          loadingLabel="Escolhendo"
        >
          <Shuffle aria-hidden="true" className="size-4" />
          Sortear uma ideia
        </Button>
      </form>
    </div>
  );
}
