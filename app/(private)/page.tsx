import { Lightbulb } from "lucide-react";

import { ButtonLink } from "@/components/ui/button-link";
import { EmptyState } from "@/components/ui/empty-state";
import { NextDate } from "@/features/dates/components/next-date";
import { getNextConfirmedDate } from "@/features/dates/data/queries";
import { PlanCard } from "@/features/plans/components/plan-card";
import { countPlansByStatus, listPlans } from "@/features/plans/data/queries";
import { requireAuthorizedContext } from "@/lib/auth/authorization";
import { PLAN_STATUSES, statusLabel } from "@/lib/status";

/**
 * Home. O "Próximo DATE" só aparece quando existe plano com data confirmada em
 * dia civil não passado; sem isso a seção não existe, em vez de existir vazia.
 *
 * `now` é uma referência única, do servidor, usada por toda a formatação da
 * página — dois relógios produziriam divergência de hidratação.
 */
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
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-2">
        <span className="type-label text-text-muted">Olá</span>
        <h1 className="type-display-l text-text">Início</h1>
      </header>

      {proximo ? <NextDate next={proximo} now={now} /> : null}

      {comAlgum.length > 0 ? (
        <section className="flex flex-col gap-4">
          <h2 className="type-label text-text-muted">O mês em números</h2>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {comAlgum.map((status) => (
              <div
                key={status}
                className="border-border-subtle flex flex-col gap-1 rounded-md border p-4"
              >
                <dt className="type-label text-text-muted">
                  {statusLabel(status)}
                </dt>
                <dd className="type-title tnum text-text">
                  {porStatus.get(status) ?? 0}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="type-label text-text-muted">Ideias recentes</h2>
          {recentes.length > 0 ? (
            <ButtonLink href="/ideias" variant="ghost" size="sm">
              Ver todas
            </ButtonLink>
          ) : null}
        </div>

        {recentes.length === 0 ? (
          <EmptyState
            icon={Lightbulb}
            title="Nada salvo ainda"
            description="Quando vocês salvarem a primeira ideia, ela aparece aqui."
            action={
              <ButtonLink href="/novo" variant="primary">
                Criar a primeira
              </ButtonLink>
            }
          />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recentes.map((plan) => (
              <li key={plan.id}>
                <PlanCard plan={plan} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
