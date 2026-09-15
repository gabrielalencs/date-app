import Link from "next/link";
import { ArrowUpRight, Bookmark, Heart, MapPin, Wallet } from "lucide-react";
import { CategoryArt } from "@/components/brand/category-art";
import { StatusPill } from "@/components/ui/status-pill";
import { MediaImage } from "@/features/media/components/media-image";
import type { PlanSummary } from "@/features/plans/data/queries";
import { categoryLabel } from "@/lib/categories";
import { cn } from "@/lib/cn";
import { formatCents } from "@/lib/money";
import { statusStrikesTitle } from "@/lib/status";

export function PlanCard({ plan }: { plan: PlanSummary }) {
  const riscado = statusStrikesTitle(plan.status);
  return (
    <Link
      href={`/planos/${plan.id}`}
      className="border-border-subtle bg-surface group interactive-lift flex h-full min-w-0 flex-col overflow-hidden rounded-lg border"
    >
      {plan.coverMediaId ? (
        <div className="relative aspect-4/5 w-full overflow-hidden">
          <MediaImage
            mediaId={plan.coverMediaId}
            alt={plan.title}
            variant="thumb"
            sizes="(min-width: 1280px) 360px, (min-width: 640px) 40vw, 90vw"
            className="photo-zoom"
          />
          <span className="bg-surface type-meta absolute top-3 left-3 rounded-full px-3 py-1">
            {categoryLabel(plan.category)}
          </span>
        </div>
      ) : (
        <CategoryArt
          category={plan.category}
          title={plan.title}
          cancelled={riscado}
          className="min-h-44 sm:aspect-4/3"
        />
      )}
      <div className="flex flex-1 flex-col gap-3 p-5">
        {plan.coverMediaId ? (
          <p
            className={cn(
              "font-display line-clamp-2 text-[1.4rem] leading-tight tracking-tight break-words",
              riscado && "line-through",
            )}
          >
            {plan.title}
          </p>
        ) : null}
        {plan.isFavorite || plan.wantALotBy.length > 0 ? (
          <div className="type-meta flex flex-wrap gap-2">
            {plan.isFavorite ? (
              <span className="bg-sage-soft inline-flex items-center gap-1.5 rounded-full px-2.5 py-1">
                <Bookmark
                  aria-hidden="true"
                  className="size-3.5"
                  fill="currentColor"
                />
                Seu favorito
              </span>
            ) : null}
            {plan.wantALotBy.length > 0 ? (
              <span className="bg-blush-soft inline-flex items-center gap-1.5 rounded-full px-2.5 py-1">
                <Heart
                  aria-hidden="true"
                  className="size-3.5"
                  fill="currentColor"
                />
                {plan.wantALotBy.join(" e ")} {plan.wantALotBy.length > 1 ? "querem" : "quer"} muito
              </span>
            ) : null}
          </div>
        ) : null}
        <div className="type-meta text-text-muted flex flex-col gap-2">
          {plan.city ? (
            <span className="flex items-center gap-2">
              <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
              {plan.city}
            </span>
          ) : null}
          {plan.estimatedBudgetCents !== null ? (
            <span className="tnum flex items-center gap-2">
              <Wallet aria-hidden="true" className="size-3.5 shrink-0" />
              {formatCents(plan.estimatedBudgetCents)}{" "}
              <span className="text-xs">(est.)</span>
            </span>
          ) : null}
        </div>
        <div className="mt-auto flex items-center justify-between gap-3 pt-1">
          <StatusPill status={plan.status} />
          {plan.archivedAt ? (
            <span className="type-meta text-text-muted">Arquivado</span>
          ) : null}
          <ArrowUpRight aria-hidden="true" className="text-text-muted size-4" />
        </div>
      </div>
    </Link>
  );
}
