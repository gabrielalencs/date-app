import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronDown, MapPin, Pencil, Wallet } from "lucide-react";
import { EditorialNote } from "@/components/brand/editorial";
import { CategoryArt } from "@/components/brand/category-art";
import { PlanDates } from "@/features/dates/components/plan-dates";
import {
  listPlanDateOptions,
  listWorkspaceMembers,
} from "@/features/dates/data/queries";
import { PlanPhotos } from "@/features/media/components/plan-photos";
import { PlanChecklist } from "@/features/planning/components/plan-checklist";
import { PlanExpenses } from "@/features/planning/components/plan-expenses";
import { PlanReservation } from "@/features/planning/components/plan-reservation";
import {
  getReservation,
  isReadOnly,
  listChecklist,
  listExpenses,
  readPlanFacts,
  reservationAvailable,
  totalCents,
} from "@/features/planning/data/queries";
import { PlanMemorySection } from "@/features/memories/components/plan-memory";
import { getPlanMemory } from "@/features/memories/data/queries";
import { MediaImage } from "@/features/media/components/media-image";
import { listPlanMedia } from "@/features/media/data/queries";
import { ArchivePlanForm } from "@/features/plans/components/archive-plan-form";
import { EditPlanForm } from "@/features/plans/components/edit-plan-form";
import { PlanStatusControl } from "@/features/plans/components/plan-status-control";
import { getPlan } from "@/features/plans/data/queries";
import { requireAuthorizedContext } from "@/lib/auth/authorization";
import { categoryLabel } from "@/lib/categories";
import { NotFoundError } from "@/lib/errors";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/cn";

export default async function Page({ params }: PageProps<"/planos/[id]">) {
  const ctx = await requireAuthorizedContext();
  const { id } = await params;
  const plan = await getPlan(ctx, id).catch((error: unknown) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  /* `now` desce do servidor e atravessa tudo, inclusive as pré-condições: é
     ele que decide se a data confirmada já chegou, e um segundo relógio faria
     a tela oferecer uma ação que a mutation recusaria. */
  const now = new Date();

  const [
    photos,
    dateOptions,
    reservation,
    checklist,
    expenses,
    members,
    facts,
    memory,
  ] = await Promise.all([
    listPlanMedia(ctx, plan.id),
    listPlanDateOptions(ctx, plan.id),
    getReservation(ctx, plan.id),
    listChecklist(ctx, plan.id),
    listExpenses(ctx, plan.id),
    listWorkspaceMembers(ctx),
    readPlanFacts(ctx, plan.id, undefined, now),
    /* Uma consulta a mais na página, não uma por avaliação: as duas notas
       chegam juntas, e as fotos e os gastos vêm das camadas do B5 e do B8 que
       já estavam aqui (seção 7 do docs/MEMORIES.md). */
    getPlanMemory(ctx, plan.id),
  ]);

  /* Plano cancelado ou arquivado é leitura nas três seções (seção 8 do
     docs/PLANNING.md). A camada de dados recusa de novo — isto aqui é só para
     a tela não oferecer o que seria recusado. */
  const somenteLeitura = isReadOnly(plan);
  const reservaDisponivel =
    plan.requiresBooking && reservationAvailable(plan, facts);
  const cover = photos.find((photo) => photo.id === plan.coverMediaId);

  /* `gallery` é antes, `memory` é depois: mesma tabela, mesma consulta, duas
     grades (seção 5 do docs/MEMORIES.md). A capa aparece na grade a que ela
     pertence — uma foto de memória que virou capa continua sendo memória, e é
     por isso que `setPlanCover` não reescreve mais o propósito dela. */
  const fotosDoPlano = photos.filter((photo) => photo.purpose !== "memory");
  const fotosDaMemoria = photos.filter((photo) => photo.purpose === "memory");

  const realizado = plan.status === "completed";
  const totalGasto = expenses.length > 0 ? totalCents(expenses) : null;
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
                    : formatCents(plan.estimatedBudgetCents)}
                </dd>
              </div>
            </div>
          </dl>
        </article>
        <aside className="flex flex-col gap-5 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <div className="panel flex flex-col gap-6 !p-5">
            <PlanStatusControl
              planId={plan.id}
              status={plan.status}
              facts={facts}
            />
            <div className="border-border-subtle border-t pt-5">
              <ArchivePlanForm
                planId={plan.id}
                archived={plan.archivedAt !== null}
              />
            </div>
          </div>
          {plan.requiresBooking ? (
            <PlanReservation
              planId={plan.id}
              reservation={reservation}
              available={reservaDisponivel}
              readOnly={!reservaDisponivel}
            />
          ) : null}
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
          {/* No desktop a reserva fica no rail; no mobile o rail vem antes
              desta coluna, preservando reserva -> checklist -> gastos. */}
          {/* Depois de realizado, o checklist é leitura (seção 3 do
              docs/MEMORIES.md): "o que levar" não tem mais função depois de a
              pessoa já ter ido. Os gastos, ao contrário, continuam editáveis —
              é depois que se sabe quanto custou. */}
          <PlanChecklist
            planId={plan.id}
            items={checklist}
            now={now}
            readOnly={somenteLeitura || realizado}
          />
          <PlanExpenses
            planId={plan.id}
            expenses={expenses}
            estimatedBudgetCents={plan.estimatedBudgetCents}
            members={members}
            readOnly={somenteLeitura}
          />
          {realizado ? (
            <PlanMemorySection
              planId={plan.id}
              planTitle={plan.title}
              memory={memory}
              photos={fotosDaMemoria}
              coverMediaId={plan.coverMediaId}
              totalSpentCents={totalGasto}
              viewerProfileId={ctx.profileId}
              readOnly={somenteLeitura}
            />
          ) : null}
          <PlanPhotos
            planId={plan.id}
            planTitle={plan.title}
            photos={fotosDoPlano}
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
