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
 *
 * No plano realizado a seção **encolhe para a data que aconteceu** (seção 9 do
 * docs/MEMORIES.md). As outras candidatas continuam gravadas, mas deixaram de
 * ser informação: quem abre a página de um date que já aconteceu quer saber
 * quando ele foi, não quais sábados estavam em disputa três meses atrás.
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
  const realizado = planStatus === "completed";

  /* Realizado tem data confirmada por pré-condição (D-102); o `?? options` é
     só para um plano antigo, de antes dela, não sumir com a seção inteira. */
  const confirmadas = options.filter((option) => option.isConfirmed);
  const visiveis =
    realizado && confirmadas.length > 0 ? confirmadas : options;

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="section-heading">
          {realizado ? "Quando foi" : "Datas para vocês"}
        </h2>
        {cheio || encerrado ? null : <AddDateForm planId={planId} />}
      </div>

      {visiveis.length === 0 ? (
        <div className="bg-mist-soft flex flex-col items-center gap-3 rounded-lg px-6 py-8 text-center">
          <CalendarDays
            aria-hidden="true"
            className="text-text-muted size-6"
            strokeWidth={1.5}
          />
          <p className="type-body-s text-text-muted max-w-xs">
            Nenhuma data sugerida. Escolham um dia e vejam o que funciona para
            os dois.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col">
          {visiveis.map((option) => (
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

      {cheio && !realizado ? (
        <p className="type-meta text-text-muted">
          São {MAX_OPTIONS_PER_PLAN} datas, o máximo por plano. Apague uma para
          sugerir outra.
        </p>
      ) : null}
    </section>
  );
}
