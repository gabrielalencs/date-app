import Link from "next/link";

import { StatusPill } from "@/components/ui/status-pill";
import { MediaImage } from "@/features/media/components/media-image";
import type { PlanSummary } from "@/features/plans/data/queries";
import { categoryLabel } from "@/lib/categories";
import { cn } from "@/lib/cn";
import { formatBRL } from "@/lib/format";
import { statusStrikesTitle } from "@/lib/status";

/**
 * Com foto, a capa é a foto — proporção 4/5, que é a do card de ideia na seção
 * 4 do design system.
 *
 * Sem foto, a capa tipográfica do D-041 permanece, e agora como estado vazio
 * definitivo e não como contorno: o próprio título em Fraunces sobre a
 * superfície afundada parece intencional, e um retângulo cinza de 300px
 * pareceria app quebrado.
 */
export function PlanCard({ plan }: { plan: PlanSummary }) {
  const riscado = statusStrikesTitle(plan.status);

  return (
    <Link
      href={`/planos/${plan.id}`}
      className="border-border-subtle bg-surface ease-standard group hover:border-border-strong flex flex-col overflow-hidden rounded-lg border transition-[opacity,transform] duration-[var(--duration-micro)] active:scale-[0.99]"
    >
      {plan.coverMediaId ? (
        <div className="relative aspect-4/5 w-full overflow-hidden">
          <MediaImage
            mediaId={plan.coverMediaId}
            alt={plan.title}
            variant="thumb"
            sizes="(min-width: 1024px) 22rem, (min-width: 640px) 45vw, 92vw"
          />
        </div>
      ) : (
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
      )}

      <div className="flex flex-col gap-2 p-4">
        {/* Com foto, o título não cabe na capa e vem para cá; sem foto ele já
            é a capa e repetir seria dizer a mesma coisa duas vezes. */}
        {plan.coverMediaId ? (
          <>
            <span className="type-label text-text-muted">
              {categoryLabel(plan.category)}
            </span>
            <p
              className={cn(
                "type-heading text-text line-clamp-2",
                riscado && "line-through",
              )}
            >
              {plan.title}
            </p>
          </>
        ) : null}

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
