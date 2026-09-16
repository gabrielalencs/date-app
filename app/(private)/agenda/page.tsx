import type { Metadata } from "next";
import { z } from "zod";

import { PageIntro } from "@/components/brand/editorial";
import { CategoryFilter } from "@/features/calendar/components/category-filter";
import { DayPanel } from "@/features/calendar/components/day-panel";
import { MonthGrid } from "@/features/calendar/components/month-grid";
import { MonthNav } from "@/features/calendar/components/month-nav";
import { UpcomingBand } from "@/features/calendar/components/upcoming-band";
import { listMonthEntries } from "@/features/calendar/data/queries";
import { buildMonthCells, entriesOfDay } from "@/features/calendar/grid";
import { listUpcomingConfirmed } from "@/features/dates/data/queries";
import { requireAuthorizedContext } from "@/lib/auth/authorization";
import { isCategory } from "@/lib/categories";
import {
  civilDayKey,
  monthOf,
  parseDayParam,
  parseMonthParam,
} from "@/lib/datetime";

/**
 * A agenda. Server Component, mês e dia na URL (D-078).
 *
 * O calendário não escreve nada: é uma segunda leitura do que o B6 grava. Toda
 * escrita continua no detalhe do plano, onde já está testada.
 */

/** Um parâmetro de query, que pode vir repetido. Fica com o primeiro. */
const param = z.unknown().transform((valor) => {
  const primeiro = Array.isArray(valor) ? valor[0] : valor;
  return typeof primeiro === "string" ? primeiro : undefined;
});

/**
 * Zod no boundary, como em toda entrada — mas **nada aqui lança**.
 *
 * URL é entrada de usuário, e a resposta a uma entrada ruim aqui é o estado
 * padrão, não uma tela de erro: `?mes=2026-13`, `?mes=abc` e `?mes=` caem todos
 * no mês corrente (D-078). Os parsers já devolvem `null` em vez de lançar, e é
 * por isso que eles existem separados de `parseDateInput`, que lança.
 */
const AgendaSearchParams = z.object({
  mes: param.transform(parseMonthParam),
  dia: param.transform(parseDayParam),
  categoria: param.transform((raw) => (isCategory(raw) ? raw : null)),
});

const PADRAO = { mes: null, dia: null, categoria: null };

export const metadata: Metadata = { title: "Agenda" };

export default async function Page({ searchParams }: PageProps<"/agenda">) {
  const ctx = await requireAuthorizedContext();
  const params = await searchParams;

  /* Os três valores vão por acesso direto em vez de entregar o objeto inteiro
     ao Zod. O `searchParams` do Next não é um objeto literal, e a checagem de
     chave ausente do Zod não o enxergava: `?mes=2027-05` chegava como
     `undefined` e a tela caía calada no mês corrente. Medido, não suposto —
     o esquema aceita o mesmo dado quando vem de um objeto comum. */
  const lido = AgendaSearchParams.safeParse({
    mes: params.mes,
    dia: params.dia,
    categoria: params.categoria,
  });

  const { mes, dia, categoria } = lido.success ? lido.data : PADRAO;

  /* `now` desce do servidor e atravessa tudo. Um `new Date()` dentro de
     componente cliente divergiria do HTML do servidor e produziria erro de
     hidratação na virada do dia (seção 6). */
  const now = new Date();
  const mesAtual = monthOf(now);
  const mesVisivel = mes ?? mesAtual;

  const [entradas, proximos] = await Promise.all([
    listMonthEntries(ctx, mesVisivel, { category: categoria }),
    listUpcomingConfirmed(ctx, now, 3),
  ]);

  const celulas = buildMonthCells({
    month: mesVisivel,
    entries: entradas,
    now,
  });

  /* Dia fora da grade visível é ignorado, não é erro: `entriesOfDay` devolve
     null quando a chave não está entre as 42 células. */
  const diaSelecionado = dia ? civilDayKey(dia) : null;
  const celulaDoDia = entriesOfDay(celulas, diaSelecionado);

  return (
    <div className="page-stack">
      <PageIntro
        eyebrow="Mais tempo juntos"
        title="Nossa agenda"
        description="O mês de vocês, com tudo que já está combinado dentro dele."
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-8">
        {/* min-w-0: item de grid tem `min-width: auto`, então o scroller
            horizontal do filtro empurraria a coluna inteira — e a grade junto —
            para além da viewport no mobile. */}
        <section
          className="flex min-w-0 flex-col gap-4"
          aria-label="Calendário do mês"
        >
          <MonthNav month={mesVisivel} today={mesAtual} category={categoria} />
          <CategoryFilter month={mesVisivel} selected={categoria} />
          <MonthGrid
            month={mesVisivel}
            cells={celulas}
            selectedDay={celulaDoDia?.key ?? null}
            category={categoria}
          />
        </section>

        <div className="flex flex-col gap-6">
          <DayPanel cell={celulaDoDia} />
          <UpcomingBand dates={proximos} now={now} />
        </div>
      </div>
    </div>
  );
}
