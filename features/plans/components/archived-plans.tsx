import Link from "next/link";
import { Archive } from "lucide-react";

import { MediaImage } from "@/features/media/components/media-image";
import { RestorePlanButton } from "@/features/plans/components/restore-plan-button";
import type { ArchivedPlan } from "@/features/plans/data/queries";
import { categoryLabel } from "@/lib/categories";
import { formatShortDate } from "@/lib/datetime";

/**
 * O arquivo, na tela.
 *
 * Mora no Perfil porque não é um lugar onde se planeja nada: é manutenção, e
 * fica ao lado das outras decisões sobre a conta. Uma aba própria na navegação
 * custaria um quinto item na barra de baixo para uma tela que se abre uma vez
 * por mês.
 *
 * Ideia e memória aparecem na mesma lista, distinguidas pela etiqueta — as duas
 * são `plans`, e separá-las em duas seções seria inventar uma diferença que o
 * banco não faz.
 */
export function ArchivedPlans({ plans }: { plans: readonly ArchivedPlan[] }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="section-heading flex items-center gap-3">
        <Archive aria-hidden="true" className="size-5" />
        Arquivados
      </h2>

      {plans.length === 0 ? (
        <p className="type-body-s text-text-muted">
          Nada arquivado. O que vocês arquivarem sai das listas e espera aqui —
          não é o mesmo que apagar.
        </p>
      ) : (
        <>
          <p className="type-body-s text-text-muted">
            Fora das listas, mas nada foi perdido. Restaure para o plano voltar
            de onde saiu.
          </p>

          <ul className="flex flex-col">
            {plans.map((plan) => (
              <li
                key={plan.id}
                className="border-border-subtle flex items-center gap-4 border-b py-4 last:border-b-0"
              >
                <span className="bg-mist-soft relative size-14 shrink-0 overflow-hidden rounded-md">
                  {plan.coverMediaId ? (
                    <MediaImage
                      mediaId={plan.coverMediaId}
                      alt=""
                      variant="thumb"
                      sizes="56px"
                    />
                  ) : null}
                </span>

                <div className="flex min-w-0 flex-col gap-1">
                  {/* O link existe porque a página de detalhe continua sendo o
                      lugar com tudo; o botão ao lado é o atalho para quem só
                      quer desfazer. */}
                  <Link
                    href={`/planos/${plan.id}`}
                    prefetch={false}
                    className="type-body text-text truncate underline-offset-4 hover:underline"
                  >
                    {plan.title}
                  </Link>
                  <p className="type-meta text-text-muted">
                    {plan.status === "completed" ? "Memória" : "Ideia"}
                    {plan.category
                      ? ` · ${categoryLabel(plan.category)}`
                      : ""}{" "}
                    · arquivado em {formatShortDate(plan.archivedAt)}
                  </p>
                </div>

                <div className="ml-auto shrink-0">
                  <RestorePlanButton planId={plan.id} title={plan.title} />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
