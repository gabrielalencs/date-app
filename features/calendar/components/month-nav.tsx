import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { agendaHref } from "@/features/calendar/url";
import {
  addMonths,
  formatMonthTitle,
  isSameCivilMonth,
  type CivilMonth,
} from "@/lib/datetime";

/**
 * Anterior, seguinte e "Hoje" são **links**, não botões com estado (D-078).
 *
 * Cada mês é uma URL de verdade: recarregar funciona, compartilhar funciona, o
 * histórico do navegador se comporta e a leitura não depende de JavaScript.
 *
 * Os dois chevrons têm 44px de alvo e nome acessível próprio — "‹" não diz nada
 * para quem não vê a seta.
 */
export function MonthNav({
  month,
  today,
  category,
}: {
  month: CivilMonth;
  today: CivilMonth;
  category: string | null;
}) {
  const anterior = addMonths(month, -1);
  const seguinte = addMonths(month, 1);
  const noMesDeHoje = isSameCivilMonth(month, today);

  const seta =
    "text-text-muted hover:bg-surface-soft hover:text-text grid size-11 place-items-center rounded-full transition-colors";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-1">
        <Link
          href={agendaHref({ month: anterior, category })}
          aria-label={`Mês anterior, ${formatMonthTitle(anterior)}`}
          className={seta}
        >
          <ChevronLeft
            aria-hidden="true"
            className="size-5"
            strokeWidth={1.5}
          />
        </Link>

        <h2 className="type-title text-text min-w-0 px-1">
          {formatMonthTitle(month)}
        </h2>

        <Link
          href={agendaHref({ month: seguinte, category })}
          aria-label={`Próximo mês, ${formatMonthTitle(seguinte)}`}
          className={seta}
        >
          <ChevronRight
            aria-hidden="true"
            className="size-5"
            strokeWidth={1.5}
          />
        </Link>
      </div>

      {/* Some quando já estamos no mês de hoje: link que não leva a lugar
          nenhum é ruído, e ocupa uma parada de tabulação. */}
      {noMesDeHoje ? null : (
        <Link
          href={agendaHref({ month: today, category })}
          className="border-border-subtle text-text hover:bg-surface-soft type-meta inline-flex min-h-11 items-center rounded-full border px-4 transition-colors"
        >
          Hoje
        </Link>
      )}
    </div>
  );
}
