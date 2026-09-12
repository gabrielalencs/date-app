import "server-only";

import { and, asc, eq, gte, isNull, lt, notInArray } from "drizzle-orm";

import { db } from "@/db/client";
import { planDateOptions, plans } from "@/db/schema/index.ts";
import { monthWindow, type CalendarEntry } from "@/features/calendar/grid";
import type { AuthorizedContext } from "@/lib/auth/authorization-core";
import type { CivilMonth } from "@/lib/datetime";

/**
 * Leitura do calendário. Contexto em primeiro lugar, `workspaceId` nunca é
 * parâmetro, todo `where` começa pelo predicado de workspace (D-037).
 *
 * O calendário não escreve nada: ele é uma segunda leitura do que o B6 grava
 * (seção 1 do docs/CALENDAR.md). Não há `mutations.ts` aqui, e isso é de
 * propósito.
 */

/**
 * Todas as opções que caem na grade do mês. **Uma** consulta por render —
 * nunca uma por célula, nunca uma por plano (seção 4).
 *
 * A janela é semiaberta e sai de `monthWindow`, que é puro e testado sem banco
 * (D-075). Ela cobre a grade inteira, incluindo os dias de meses vizinhos: se
 * há um date em 31 de agosto e a grade de setembro mostra aquela célula, o date
 * aparece nela — meio-mês vazio por conveniência de implementação seria mentira
 * visual (D-076).
 *
 * `starts_at` ordenado e com o workspace na frente usa o índice
 * `plan_date_options_workspace_starts_at_idx`, que já existia desde o B2.
 */
export async function listMonthEntries(
  ctx: AuthorizedContext,
  month: CivilMonth,
  options: { category?: string | null } = {},
): Promise<CalendarEntry[]> {
  const janela = monthWindow(month);

  const filtros = [
    eq(planDateOptions.workspaceId, ctx.workspaceId),
    eq(plans.workspaceId, ctx.workspaceId),
    gte(planDateOptions.startsAt, janela.start),
    lt(planDateOptions.startsAt, janela.end),
    /* Cancelado e arquivado não aparecem; `completed` aparece, na data em que
       aconteceu (D-079). O calendário é o primeiro lugar onde o produto vira
       arquivo de memória. */
    isNull(plans.archivedAt),
    notInArray(plans.status, ["cancelled"]),
  ];

  if (options.category) {
    filtros.push(eq(plans.category, options.category));
  }

  return db
    .select({
      optionId: planDateOptions.id,
      planId: plans.id,
      planTitle: plans.title,
      planStatus: plans.status,
      category: plans.category,
      coverMediaId: plans.coverMediaId,
      startsAt: planDateOptions.startsAt,
      allDay: planDateOptions.allDay,
      isConfirmed: planDateOptions.isConfirmed,
    })
    .from(planDateOptions)
    .innerJoin(plans, eq(plans.id, planDateOptions.planId))
    .where(and(...filtros))
    .orderBy(asc(planDateOptions.startsAt));
}
