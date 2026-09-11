import Link from "next/link";

import { StatusPill } from "@/components/ui/status-pill";
import type { PlanSummary } from "@/features/plans/data/queries";
import { categoryLabel } from "@/lib/categories";
import { cn } from "@/lib/cn";
import { formatBRL } from "@/lib/format";
import { statusStrikesTitle } from "@/lib/status";

/**
 * Até o B5 não existe foto, e um retângulo cinza de 300px faria o app parecer
 * quebrado em vez de vazio (D-041). A capa é tipográfica: o próprio título em
 * Fraunces sobre a superfície afundada, com a categoria como rótulo.
 */
export function PlanCard({ plan }: { plan: PlanSummary }) {
  const riscado = statusStrikesTitle(plan.status);

  return (
    <Link
      href={`/planos/${plan.id}`}
      className="border-border-subtle bg-surface ease-standard group hover:border-border-strong flex flex-col overflow-hidden rounded-lg border transition-[opacity,transform] duration-[var(--duration-micro)] active:scale-[0.99]"
    >
      <div className="bg-surface-sunken flex aspect-4/5 flex-col justify-between gap-4 p-5">
        <span className="type-label text-text-muted">
          {categoryLabel(plan.category)}
        </span>
        <p
          className={cn(
            "type-title text-text line-clamp-4",
            riscado && "line-through",
          )}
        >
          {plan.title}
        </p>
      </div>

      <div className="flex flex-col gap-2 p-4">
        <StatusPill status={plan.status} />
        <div className="type-meta text-text-muted flex flex-wrap items-center gap-x-2 gap-y-1">
          {plan.city ? <span>{plan.city}</span> : null}
          {plan.city && plan.estimatedBudgetCents !== null ? (
            <span aria-hidden="true">·</span>
          ) : null}
          {plan.estimatedBudgetCents !== null ? (
            <span className="tnum">
              {formatBRL(plan.estimatedBudgetCents / 100)}
            </span>
          ) : null}
          {plan.archivedAt ? (
            <span className="type-label text-text-muted">· Arquivado</span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
