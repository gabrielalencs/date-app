import { isCategory, type Category } from "@/lib/categories";
import { InvalidMoneyError, parseBRLToCents } from "@/lib/money";
import { OPEN_STATUSES } from "@/lib/plan-status";
import { PLAN_STATUSES, type PlanStatus } from "@/lib/status";

export type DiscoverySort = "recent" | "priority" | "budget";

export type DiscoveryFilters = {
  status: PlanStatus | "open";
  category?: Category;
  sort: DiscoverySort;
  maxBudgetCents?: number;
  favoritesOnly: boolean;
};

export type RawDiscoveryFilters = {
  status?: string;
  category?: string;
  sort?: string;
  maxBudget?: string;
  favorites?: string;
};

function statusOf(value: string | undefined): PlanStatus | "open" {
  if (value && (PLAN_STATUSES as readonly string[]).includes(value)) {
    return value as PlanStatus;
  }
  return "open";
}

function sortOf(value: string | undefined): DiscoverySort {
  return value === "priority" || value === "budget" ? value : "recent";
}

function budgetOf(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined;

  try {
    return parseBRLToCents(value);
  } catch (error) {
    if (error instanceof InvalidMoneyError) return undefined;
    throw error;
  }
}

/** Uma única interpretação para a página e para a Server Action do sorteio. */
export function parseDiscoveryFilters(
  raw: RawDiscoveryFilters,
): DiscoveryFilters {
  return {
    status: statusOf(raw.status),
    category: isCategory(raw.category) ? raw.category : undefined,
    sort: sortOf(raw.sort),
    maxBudgetCents: budgetOf(raw.maxBudget),
    favoritesOnly: raw.favorites === "1",
  };
}

export function isRandomizableStatus(
  status: PlanStatus | "open",
): boolean {
  return (
    status === "open" ||
    (OPEN_STATUSES as readonly PlanStatus[]).includes(status)
  );
}
