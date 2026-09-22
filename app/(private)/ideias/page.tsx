import type { Metadata } from "next";
import { Lightbulb, Plus } from "lucide-react";

import { PageIntro } from "@/components/brand/editorial";
import { ButtonLink } from "@/components/ui/button-link";
import { EmptyState } from "@/components/ui/empty-state";
import { PlanCard } from "@/features/plans/components/plan-card";
import { PlanFilters } from "@/features/plans/components/plan-filters";
import { listPlans } from "@/features/plans/data/queries";
import { PlanRandomizer } from "@/features/discovery/components/plan-randomizer";
import {
  isRandomizableStatus,
  parseDiscoveryFilters,
} from "@/features/discovery/filters";
import { requireAuthorizedContext } from "@/lib/auth/authorization";

export const metadata: Metadata = { title: "Ideias" };

export default async function Page({ searchParams }: PageProps<"/ideias">) {
  const ctx = await requireAuthorizedContext();
  const params = await searchParams;

  const first = (key: string): string | undefined => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const maxBudgetInput = first("teto") ?? "";
  const filters = parseDiscoveryFilters({
    status: first("status"),
    category: first("categoria"),
    sort: first("ordem"),
    maxBudget: maxBudgetInput,
    favorites: first("favoritos"),
  });

  const plans = await listPlans(ctx, filters);

  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="Lugares, vontades e possibilidades"
        title="Ideias para viver"
        description="Guardem o que inspira vocês. A próxima boa história pode começar por aqui."
        action={
          <ButtonLink href="/novo" variant="primary">
            <Plus aria-hidden="true" className="size-4" />
            Nova ideia
          </ButtonLink>
        }
      />

      <PlanFilters
        status={filters.status}
        category={filters.category}
        sort={filters.sort}
        maxBudgetInput={maxBudgetInput}
        favoritesOnly={filters.favoritesOnly}
      />

      {isRandomizableStatus(filters.status) ? (
        <PlanRandomizer
          filters={filters}
          maxBudgetInput={maxBudgetInput}
        />
      ) : null}

      {plans.length === 0 ? (
        <EmptyState
          icon={Lightbulb}
          title={
            filters.favoritesOnly
              ? "Nenhuma ideia nos seus favoritos"
              : "Nenhuma ideia combina com esses filtros"
          }
          description={
            filters.favoritesOnly
              ? "Favorite uma ideia para encontrá-la aqui depois."
              : "Afrouxe um filtro ou guarde uma vontade nova para vocês."
          }
          action={
            <ButtonLink href="/novo" variant="primary">
              Criar a primeira
            </ButtonLink>
          }
        />
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {plans.map((plan) => (
            <li key={plan.id}>
              <PlanCard plan={plan} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
