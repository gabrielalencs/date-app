import { notFound } from "next/navigation";

import { PlanDates } from "@/features/dates/components/plan-dates";
import { listPlanDateOptions } from "@/features/dates/data/queries";
import { PlanPhotos } from "@/features/media/components/plan-photos";
import { listPlanMedia } from "@/features/media/data/queries";
import { ArchivePlanForm } from "@/features/plans/components/archive-plan-form";
import { EditPlanForm } from "@/features/plans/components/edit-plan-form";
import { PlanStatusControl } from "@/features/plans/components/plan-status-control";
import { getPlan } from "@/features/plans/data/queries";
import { requireAuthorizedContext } from "@/lib/auth/authorization";
import { categoryLabel } from "@/lib/categories";
import { NotFoundError } from "@/lib/errors";

export default async function Page({ params }: PageProps<"/planos/[id]">) {
  const ctx = await requireAuthorizedContext();
  const { id } = await params;

  /* Plano de outro workspace cai aqui como NotFoundError e vira 404, igual a
     um id inexistente: distinguir confirmaria que o id existe (D-038). */
  const plan = await getPlan(ctx, id).catch((error: unknown) => {
    if (error instanceof NotFoundError) {
      notFound();
    }
    throw error;
  });

  const [photos, dateOptions] = await Promise.all([
    listPlanMedia(ctx, plan.id),
    listPlanDateOptions(ctx, plan.id),
  ]);

  /* Uma referência de agora, vinda do servidor, para a formatação não depender
     do relógio do navegador e não divergir na hidratação. */
  const now = new Date();

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <span className="type-label text-text-muted">
          {categoryLabel(plan.category)}
        </span>
        <h1 className="type-display-l text-text">{plan.title}</h1>
      </header>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
        <div className="flex flex-col gap-10">
          <PlanPhotos
            planId={plan.id}
            planTitle={plan.title}
            photos={photos}
            coverMediaId={plan.coverMediaId}
          />
          <PlanDates
            planId={plan.id}
            planStatus={plan.status}
            options={dateOptions}
            now={now}
          />
          <EditPlanForm plan={plan} />
        </div>

        {/* No desktop vira painel lateral; no mobile empilha abaixo do form. */}
        <aside className="border-border-subtle flex flex-col gap-8 border-t pt-8 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
          <PlanStatusControl planId={plan.id} status={plan.status} />
          <ArchivePlanForm
            planId={plan.id}
            archived={plan.archivedAt !== null}
          />
        </aside>
      </div>
    </div>
  );
}
