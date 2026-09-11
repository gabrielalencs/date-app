import Link from "next/link";
import { ArrowRight, ArrowUpRight, Lightbulb, Plus } from "lucide-react";
import {
  EditorialNote,
  PageIntro,
  PhotoStory,
} from "@/components/brand/editorial";
import { ButtonLink } from "@/components/ui/button-link";
import { EmptyState } from "@/components/ui/empty-state";
import { NextDate } from "@/features/dates/components/next-date";
import { getNextConfirmedDate } from "@/features/dates/data/queries";
import { PlanCard } from "@/features/plans/components/plan-card";
import { countPlansByStatus, listPlans } from "@/features/plans/data/queries";
import { requireAuthorizedContext } from "@/lib/auth/authorization";
import { PLAN_STATUSES, statusLabel } from "@/lib/status";

export default async function Page() {
  const ctx = await requireAuthorizedContext();
  const now = new Date();
  const [recentes, contagens, proximo] = await Promise.all([
    listPlans(ctx, { status: "open", sort: "recent", limit: 6 }),
    countPlansByStatus(ctx),
    getNextConfirmedDate(ctx, now),
  ]);
  const porStatus = new Map(
    contagens.map(({ status, total }) => [status, total]),
  );
  const comAlgum = PLAN_STATUSES.filter(
    (status) => (porStatus.get(status) ?? 0) > 0,
  );

  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="A vida acontece juntos"
        title="Olá, vocês dois."
        description="Que tal transformar uma vontade em um momento de vocês?"
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {proximo ? (
          <NextDate next={proximo} now={now} />
        ) : (
          <PhotoStory priority className="min-h-80 sm:min-h-96">
            <span className="type-label mb-4">Inspiração para viver</span>
            <p className="type-display-l max-w-[13ch]">
              O melhor lugar
              <br />é junto.
            </p>
            <span className="editorial-rule mt-5" />
          </PhotoStory>
        )}
        <div className="flex flex-col gap-5">
          {proximo ? (
            <PhotoStory priority className="min-h-72 flex-1">
              <span className="type-label mb-3">Inspiração para viver</span>
              <p className="type-title max-w-[13ch]">O melhor lugar é junto.</p>
              <span className="editorial-rule mt-4" />
            </PhotoStory>
          ) : (
            <EditorialNote tone="blush" className="flex-1">
              Grandes histórias começam com pequenos planos.
            </EditorialNote>
          )}
          <Link
            href="/novo"
            className="bg-brand text-brand-fg interactive-lift flex min-h-24 items-center gap-4 rounded-lg p-5"
          >
            <Plus aria-hidden="true" className="size-6" />
            <span className="flex-1 text-base font-medium">
              Guardar uma nova ideia
            </span>
            <ArrowUpRight aria-hidden="true" className="size-5" />
          </Link>
        </div>
      </div>
      {comAlgum.length > 0 ? (
        <section className="border-border-subtle flex flex-col gap-4 border-y py-5 sm:flex-row sm:items-center sm:gap-8">
          <h2 className="type-label text-text-muted shrink-0">
            Os planos de vocês
          </h2>
          <dl className="flex flex-wrap gap-x-7 gap-y-4">
            {comAlgum.map((status) => (
              <div key={status} className="flex items-baseline gap-2">
                <dd className="type-meta tnum font-semibold">
                  {porStatus.get(status) ?? 0}
                </dd>
                <dt className="type-meta text-text-muted">
                  {statusLabel(status)}
                </dt>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
      <section className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="type-label text-text-muted">
              Para o próximo encontro
            </span>
            <h2 className="section-heading mt-2">Ideias recentes</h2>
          </div>
          {recentes.length > 0 ? (
            <ButtonLink href="/ideias" variant="ghost" size="sm">
              Ver todas
              <ArrowRight aria-hidden="true" className="size-4" />
            </ButtonLink>
          ) : null}
        </div>
        {recentes.length === 0 ? (
          <EmptyState
            icon={Lightbulb}
            title="Nada salvo ainda"
            description="Um café, uma viagem ou um lugar que chamou a atenção. A primeira ideia pode ser simples."
            action={<ButtonLink href="/novo">Criar a primeira</ButtonLink>}
          />
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {recentes.map((plan) => (
              <li key={plan.id} className="min-w-0">
                <PlanCard plan={plan} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
