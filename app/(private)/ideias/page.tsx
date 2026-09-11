import { Lightbulb, Plus } from "lucide-react";

import { PageIntro } from "@/components/brand/editorial";
import { ButtonLink } from "@/components/ui/button-link";
import { EmptyState } from "@/components/ui/empty-state";
import { PlanCard } from "@/features/plans/components/plan-card";
import { PlanFilters } from "@/features/plans/components/plan-filters";
import { listPlans, type PlanSort } from "@/features/plans/data/queries";
import { requireAuthorizedContext } from "@/lib/auth/authorization";
import { isCategory } from "@/lib/categories";
import { PLAN_STATUSES, type PlanStatus } from "@/lib/status";

function parseStatus(value: string | undefined): PlanStatus | "open" {
  if (value && (PLAN_STATUSES as readonly string[]).includes(value)) {
    return value as PlanStatus;
  }
  return "open";
}

function parseSort(value: string | undefined): PlanSort {
  return value === "priority" || value === "budget" ? value : "recent";
}

export default async function Page({ searchParams }: PageProps<"/ideias">) {
  const ctx = await requireAuthorizedContext();
  const params = await searchParams;

  const first = (key: string): string | undefined => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const status = parseStatus(first("status"));
  const categoria = first("categoria");
  const sort = parseSort(first("ordem"));

  const plans = await listPlans(ctx, {
    status,
    category: isCategory(categoria) ? categoria : undefined,
    sort,
  });

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
        status={status}
        category={isCategory(categoria) ? categoria : undefined}
        sort={sort}
      />

      {plans.length === 0 ? (
        <EmptyState
          icon={Lightbulb}
          title="Nenhuma ideia por aqui ainda"
          description="Salve um lugar, um link ou uma vontade solta. Dá para decidir a data depois."
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
