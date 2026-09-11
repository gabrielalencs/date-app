import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronDown, MapPin, Pencil, Wallet } from "lucide-react";
import { EditorialNote } from "@/components/brand/editorial";
import { CategoryArt } from "@/components/brand/category-art";
import { PlanDates } from "@/features/dates/components/plan-dates";
import { listPlanDateOptions } from "@/features/dates/data/queries";
import { PlanPhotos } from "@/features/media/components/plan-photos";
import { MediaImage } from "@/features/media/components/media-image";
import { listPlanMedia } from "@/features/media/data/queries";
import { ArchivePlanForm } from "@/features/plans/components/archive-plan-form";
import { EditPlanForm } from "@/features/plans/components/edit-plan-form";
import { PlanStatusControl } from "@/features/plans/components/plan-status-control";
import { getPlan } from "@/features/plans/data/queries";
import { requireAuthorizedContext } from "@/lib/auth/authorization";
import { categoryLabel } from "@/lib/categories";
import { NotFoundError } from "@/lib/errors";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/cn";

export default async function Page({ params }: PageProps<"/planos/[id]">) {
  const ctx = await requireAuthorizedContext();
  const { id } = await params;
  const plan = await getPlan(ctx, id).catch((error: unknown) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const [photos, dateOptions] = await Promise.all([
    listPlanMedia(ctx, plan.id),
    listPlanDateOptions(ctx, plan.id),
  ]);
  const now = new Date();
  const cover = photos.find((photo) => photo.id === plan.coverMediaId);
  return (
    <div className="page-stack">
      <Link
        href="/ideias"
        className="text-text-muted flex min-h-11 w-fit items-center gap-2 text-sm"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Voltar às ideias
      </Link>
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <article className="flex min-w-0 flex-col gap-6">
          {cover ? (
            <div className="relative aspect-[16/8] min-h-56 overflow-hidden rounded-lg">
              <MediaImage
                mediaId={cover.id}
                alt={`Capa de ${plan.title}`}
                priority
                sizes="(min-width: 1280px) 750px, 90vw"
              />
            </div>
          ) : (
            <CategoryArt category={plan.category} className="h-48 rounded-lg" />
          )}
          <header className="flex flex-col gap-3">
            <span className="type-label text-text-muted">
              {categoryLabel(plan.category)}
            </span>
            <h1
              className={cn(
                "type-display-l break-words",
                plan.status === "cancelled" && "line-through",
              )}
            >
              {plan.title}
            </h1>
            {plan.description ? (
              <p className="type-body text-text-muted break-words whitespace-pre-line">
                {plan.description}
              </p>
            ) : null}
          </header>
          <dl className="border-border-subtle grid grid-cols-1 gap-5 border-y py-5 sm:grid-cols-2">
            <div className="flex gap-3">
              <MapPin aria-hidden="true" className="mt-1 size-5 shrink-0" />
              <div>
                <dt className="type-meta text-text-muted">Onde</dt>
                <dd className="type-body-s mt-1">
                  {plan.placeName ?? plan.city ?? "Um lugar para escolher"}
                  {plan.placeName && plan.city ? (
                    <span className="type-meta text-text-muted mt-1 block">
                      {plan.city}
                      {plan.state ? `, ${plan.state}` : ""}
                    </span>
                  ) : null}
                </dd>
              </div>
            </div>
            <div className="flex gap-3">
              <Wallet aria-hidden="true" className="mt-1 size-5 shrink-0" />
              <div>
                <dt className="type-meta text-text-muted">
                  Orçamento estimado
                </dt>
                <dd className="type-body-s tnum mt-1">
                  {plan.estimatedBudgetCents === null
                    ? "Para combinar"
                    : formatBRL(plan.estimatedBudgetCents / 100)}
                </dd>
              </div>
            </div>
          </dl>
        </article>
        <aside className="flex flex-col gap-5 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <div className="panel flex flex-col gap-6 !p-5">
            <PlanStatusControl planId={plan.id} status={plan.status} />
            <div className="border-border-subtle border-t pt-5">
              <ArchivePlanForm
                planId={plan.id}
                archived={plan.archivedAt !== null}
              />
            </div>
          </div>
          <EditorialNote tone="blush" className="hidden lg:flex">
            Boas experiências também aproximam.
          </EditorialNote>
        </aside>
        <div className="flex min-w-0 flex-col gap-10 lg:col-start-1">
          <PlanDates
            planId={plan.id}
            planStatus={plan.status}
            options={dateOptions}
            now={now}
          />
          <PlanPhotos
            planId={plan.id}
            planTitle={plan.title}
            photos={photos}
            coverMediaId={plan.coverMediaId}
            showCover={false}
          />
          <details className="editor-disclosure panel">
            <summary>
              <span className="section-heading flex items-center gap-3">
                <Pencil aria-hidden="true" className="size-5" />
                Editar detalhes
              </span>
              <ChevronDown aria-hidden="true" className="size-5 shrink-0" />
            </summary>
            <EditPlanForm plan={plan} />
          </details>
        </div>
      </div>
    </div>
  );
}
