import type { Metadata } from "next";
import { Images } from "lucide-react";

import { PageIntro } from "@/components/brand/editorial";
import { ButtonLink } from "@/components/ui/button-link";
import { EmptyState } from "@/components/ui/empty-state";
import { MemoryCard } from "@/features/memories/components/memory-card";
import { MemoryPagination } from "@/features/memories/components/memory-pagination";
import { listMemories } from "@/features/memories/data/queries";
import { groupByCivilMonth } from "@/features/memories/timeline";
import { parsePageParam } from "@/features/memories/url";
import { toMonthParam } from "@/lib/datetime";
import { requireAuthorizedContext } from "@/lib/auth/authorization";

/**
 * A timeline: o histórico de dates realizados, do mais recente para o mais
 * antigo, agrupado por mês (seção 6 do docs/MEMORIES.md).
 *
 * O agrupamento é pelo **dia civil** da data confirmada, com a aritmética do
 * B7. Esta página não inventa nenhuma função de data: `monthOf` e
 * `formatMonthTitle` já existem, e a zona do ESLint garante que nada escape
 * por fora. Um date às 23:00 de 30 de setembro é `2026-10-01T02:00Z`, e
 * agrupado por UTC ele mudaria de mês — a timeline erraria o mês de metade dos
 * dates noturnos.
 *
 * `listMemories` faz duas consultas, e faria as mesmas duas com seiscentos
 * planos: a página não busca capa, contagem de fotos nem avaliação por linha.
 */
export const metadata: Metadata = { title: "Memórias" };

export default async function Page({ searchParams }: PageProps<"/memorias">) {
  const ctx = await requireAuthorizedContext();
  const params = await searchParams;

  const bruto = params.pagina;
  const pagina = parsePageParam(Array.isArray(bruto) ? bruto[0] : bruto);

  const { entries, page, pageCount, total } = await listMemories(ctx, {
    page: pagina,
  });

  const now = new Date();
  const meses = groupByCivilMonth(entries, (entry) => entry.happenedAt);

  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="O que fica com a gente"
        title="Memórias"
        description={
          total === 0
            ? "Os dates que já aconteceram ficam guardados aqui."
            : `${total} ${total === 1 ? "date realizado" : "dates realizados"}, do mais recente ao mais antigo.`
        }
      />

      {total === 0 ? (
        <EmptyState
          icon={Images}
          title="Nada guardado por aqui ainda"
          description="As memórias começam quando um date é marcado como realizado. A partir daí ele sai das ideias e fica nesta página, com as fotos de vocês e o que cada um achou."
          action={
            <ButtonLink href="/agenda" variant="secondary">
              Ver o que está marcado
            </ButtonLink>
          }
        />
      ) : (
        <div className="flex flex-col gap-12">
          {meses.map((mes) => (
            <section
              key={toMonthParam(mes.month)}
              /* O mês fica legível para a suíte de navegador: é ele que prova
                 que um date às 23:30 do dia 31 não escorregou para o mês
                 seguinte na tela real, e não só na função pura. */
              data-month-group={toMonthParam(mes.month)}
              className="flex flex-col gap-5"
            >
              <div className="border-border-subtle flex flex-wrap items-baseline justify-between gap-3 border-b pb-3">
                <h2 className="type-title">{mes.title}</h2>
                <span className="type-meta text-text-muted tnum">
                  {mes.items.length}{" "}
                  {mes.items.length === 1 ? "date" : "dates"}
                </span>
              </div>

              <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {mes.items.map((entry) => (
                  <li key={entry.planId}>
                    <MemoryCard entry={entry} now={now} />
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <MemoryPagination page={page} pageCount={pageCount} />
        </div>
      )}
    </div>
  );
}
