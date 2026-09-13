import { z } from "zod";
import { Images } from "lucide-react";

import { PageIntro } from "@/components/brand/editorial";
import { ButtonLink } from "@/components/ui/button-link";
import { EmptyState } from "@/components/ui/empty-state";
import { MemoryCard } from "@/features/memories/components/memory-card";
import { TimelineNav } from "@/features/memories/components/timeline-nav";
import { listMemoryTimeline } from "@/features/memories/data/queries";
import { groupByMonth, parsePageParam } from "@/features/memories/timeline";
import { requireAuthorizedContext } from "@/lib/auth/authorization";

/**
 * A timeline. Server Component, página na URL (D-078), histórico cronológico
 * do mais recente para o mais antigo, agrupado por mês.
 *
 * Não escreve nada: é uma segunda leitura do que já está gravado, como o
 * calendário do B7 foi para as datas. Toda escrita continua no detalhe do
 * plano, onde já está testada.
 *
 * O agrupamento é pelo **dia civil** da data confirmada, com a aritmética do
 * B7. Nenhuma função de data nova, e a zona do ESLint (D-073) garante que nada
 * escape: um date às 23:00 de 30 de setembro é `2026-10-01T02:00Z`, e agrupado
 * por UTC ele mudaria de mês — a timeline erraria o mês de metade dos dates
 * noturnos.
 */

/** Um parâmetro de query, que pode vir repetido. Fica com o primeiro. */
const param = z.unknown().transform((valor) => {
  const primeiro = Array.isArray(valor) ? valor[0] : valor;
  return typeof primeiro === "string" ? primeiro : undefined;
});

/**
 * Zod no boundary, e **nada aqui lança**. URL é entrada de usuário, e a
 * resposta a uma entrada ruim é o estado padrão, não uma tela de erro:
 * `?pagina=0`, `?pagina=-1` e `?pagina=abc` caem todos na primeira página.
 */
const MemoriasSearchParams = z.object({
  pagina: param.transform(parsePageParam),
});

export default async function Page({ searchParams }: PageProps<"/memorias">) {
  const ctx = await requireAuthorizedContext();
  const params = await searchParams;

  /* Por acesso direto, não entregando o objeto inteiro ao Zod: o
     `searchParams` do Next não é um objeto literal, e a checagem de chave
     ausente do Zod não o enxergava — foi assim que `?mes=` chegou como
     `undefined` na agenda do B7, com a tela caindo calada no mês corrente. */
  const lido = MemoriasSearchParams.safeParse({ pagina: params.pagina });
  const pagina = lido.success ? lido.data.pagina : 1;

  const timeline = await listMemoryTimeline(ctx, pagina);

  /* `now` desce do servidor e atravessa tudo. Um `new Date()` dentro de
     componente cliente divergiria do HTML do servidor e produziria erro de
     hidratação na virada do dia. */
  const now = new Date();
  const meses = groupByMonth(timeline.items);

  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="O que fica com a gente"
        title="Memórias"
        description="Os dates que já aconteceram, do mais recente para o mais antigo."
      />

      {timeline.items.length === 0 ? (
        <EmptyState
          icon={Images}
          title={
            timeline.hasPrevious
              ? "Esta página está além do fim."
              : "As memórias começam quando um date é marcado como realizado."
          }
          description={
            timeline.hasPrevious
              ? "A lista acabou antes daqui. Volte para o começo para ver o que já aconteceu."
              : "Abra o plano do date que já aconteceu e marque lá. Ele passa a morar aqui, com o dia, o lugar e as fotos de vocês."
          }
          action={
            <ButtonLink
              href={timeline.hasPrevious ? "/memorias" : "/ideias"}
              variant="secondary"
            >
              {timeline.hasPrevious
                ? "Voltar ao começo"
                : "Ver nossos planos"}
            </ButtonLink>
          }
        />
      ) : (
        <div className="flex flex-col gap-10">
          {meses.map((mes, indiceDoMes) => (
            <section key={mes.title} className="flex flex-col gap-5">
              <div className="border-border-subtle flex flex-wrap items-baseline justify-between gap-3 border-b pb-3">
                <h2 className="type-title text-text">{mes.title}</h2>
                <span className="type-meta text-text-muted tnum">
                  {mes.items.length === 1
                    ? "1 date"
                    : `${mes.items.length} dates`}
                </span>
              </div>

              <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {mes.items.map((memoria, indice) => (
                  <MemoryCard
                    key={memoria.planId}
                    memory={memoria}
                    now={now}
                    priority={indiceDoMes === 0 && indice === 0}
                  />
                ))}
              </ul>
            </section>
          ))}

          <TimelineNav
            page={timeline.page}
            hasPrevious={timeline.hasPrevious}
            hasNext={timeline.hasNext}
          />
        </div>
      )}
    </div>
  );
}
