import { CalendarDays } from "lucide-react";

import { AddDateForm } from "@/features/dates/components/add-date-form";
import { DateOptionRow } from "@/features/dates/components/date-option-row";
import type { DateOption } from "@/features/dates/data/queries";
import { MAX_OPTIONS_PER_PLAN } from "@/features/dates/constants";
import type { PlanStatus } from "@/lib/status";

/**
 * Seção "Datas" do detalhe do plano (seção 9 do docs/DATES_AND_VOTING.md).
 *
 * Server Component: a lista não tem estado próprio. Quem precisa de interação
 * é cada linha e o formulário, e são eles que carregam `"use client"`.
 *
 * `now` desce do servidor para a formatação não depender do relógio do
 * navegador — com dois relógios, o HTML do servidor e o do cliente divergem e
 * o React reclama de hidratação.
 */
export function PlanDates({
  planId,
  planStatus,
  options,
  now,
}: {
  planId: string;
  planStatus: PlanStatus;
  options: readonly DateOption[];
  now: Date;
}) {
  const cheio = options.length >= MAX_OPTIONS_PER_PLAN;
  const encerrado = planStatus === "completed" || planStatus === "cancelled";

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="type-label text-text-muted">Datas</h2>
        {cheio || encerrado ? null : <AddDateForm planId={planId} />}
      </div>

      {options.length === 0 ? (
        <div className="border-border-subtle bg-surface-sunken flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center">
          <CalendarDays
            aria-hidden="true"
            className="text-text-muted size-6"
            strokeWidth={1.5}
          />
          <p className="type-body-s text-text-muted max-w-xs">
            Nenhuma data sugerida. Proponha uma e vocês dois votam — é assim que
            uma ideia vira um plano.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col">
          {options.map((option) => (
            <DateOptionRow
              key={option.id}
              planId={planId}
              planStatus={planStatus}
              option={option}
              now={now}
            />
          ))}
        </ul>
      )}

      {cheio ? (
        <p className="type-meta text-text-muted">
          São {MAX_OPTIONS_PER_PLAN} datas, o máximo por plano. Apague uma para
          sugerir outra.
        </p>
      ) : null}
    </section>
  );
}
