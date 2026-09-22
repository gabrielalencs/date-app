import { ArrowUpRight, Check } from "lucide-react";

import {
  countFilled,
  isComplete,
  planGaps,
  type PlanGap,
} from "@/features/plans/completeness";
import { EditPlanSheet } from "@/features/plans/components/edit-plan-sheet";
import type { Plan } from "@/features/plans/data/queries";
import { cn } from "@/lib/cn";

/**
 * "Complete a ideia" — a seção que abre o plano em vez de fechá-lo.
 *
 * Server Component: a única coisa interativa aqui é o botão que abre a gaveta,
 * e ele é que carrega o `"use client"`. A lista é leitura.
 *
 * O que ela mostra não é um formulário em miniatura: é o **estado** da ideia.
 * Cada linha diz o que já está escrito ou o convite para escrever, e o botão
 * único abre o formulário inteiro. Cinco campos separados abririam cinco
 * gavetas para uma pessoa que, na prática, preenche tudo de uma vez quando
 * senta para pensar no rolê.
 *
 * Preenchida por inteiro, a seção encolhe para uma linha: quem já descreveu
 * tudo não precisa de um painel dizendo que descreveu tudo — precisa do botão
 * de editar continuar existindo em algum lugar previsível.
 */
export function CompletePlanPanel({ plan }: { plan: Plan }) {
  const gaps = planGaps(plan);
  const preenchidos = countFilled(gaps);
  const completo = isComplete(gaps);

  if (completo) {
    return (
      <section className="border-border-subtle flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3">
        <span className="type-meta text-text-muted flex items-center gap-2">
          <Check aria-hidden="true" className="size-4 shrink-0" />
          Ficha completa
        </span>
        <EditPlanSheet plan={plan} variant="ghost" />
      </section>
    );
  }

  return (
    <section className="panel flex flex-col gap-5 !p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <span className="type-label text-text-muted">O que falta</span>
          <h2 className="section-heading mt-2">Complete a ideia</h2>
        </div>
        <span className="type-meta text-text-muted tnum">
          {preenchidos} de {gaps.length}
        </span>
      </div>

      {/* A barra é decoração do número ao lado, não informação nova — daí o
          aria-hidden. Quem usa leitor de tela já ouviu "3 de 5". */}
      <div
        aria-hidden="true"
        className="bg-surface-sunken h-1.5 w-full overflow-hidden rounded-full"
      >
        <div
          className="bg-accent h-full rounded-full"
          style={{ width: `${(preenchidos / gaps.length) * 100}%` }}
        />
      </div>

      <dl className="divide-border-subtle divide-y">
        {gaps.map((gap) => (
          <Linha key={gap.key} gap={gap} sourceUrl={plan.sourceUrl} />
        ))}
      </dl>

      <EditPlanSheet plan={plan} variant="primary" />
    </section>
  );
}

function Linha({
  gap,
  sourceUrl,
}: {
  gap: PlanGap;
  sourceUrl: string | null;
}) {
  /* A referência preenchida é a única linha que também é um destino: o link
     existia no banco desde o cadastro e não aparecia em lugar nenhum — salvar
     e nunca mais encontrar era o mesmo que não salvar. */
  const ehLink = gap.key === "sourceUrl" && gap.filled && sourceUrl !== null;

  return (
    <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
      <dt className="type-body-s flex items-center gap-2">
        <span
          aria-hidden="true"
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            gap.filled ? "bg-positive" : "bg-border-strong",
          )}
        />
        {gap.label}
      </dt>
      <dd
        className={cn(
          "type-body-s min-w-0 text-right",
          gap.filled ? "text-text" : "text-text-muted",
        )}
      >
        {ehLink ? (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex min-h-11 max-w-full items-center gap-1.5 underline underline-offset-4"
          >
            <span className="truncate">{gap.detail}</span>
            <ArrowUpRight aria-hidden="true" className="size-3.5 shrink-0" />
          </a>
        ) : (
          <span className="line-clamp-1 break-words">{gap.detail}</span>
        )}
      </dd>
    </div>
  );
}
