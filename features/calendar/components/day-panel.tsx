import Link from "next/link";
import { ArrowUpRight, Plus } from "lucide-react";

import { CategoryArt } from "@/components/brand/category-art";
import { ButtonLink } from "@/components/ui/button-link";
import { StatusPill } from "@/components/ui/status-pill";
import type { CalendarCell } from "@/features/calendar/grid";
import { MediaImage } from "@/features/media/components/media-image";
import { cn } from "@/lib/cn";
import {
  formatCivilDay,
  formatTime,
  formatWeekday,
  startOfDayInApp,
} from "@/lib/datetime";
import { statusStrikesTitle } from "@/lib/status";

/**
 * O dia selecionado. **Painel, não modal** (D-080): abaixo da grade no mobile,
 * ao lado no desktop. Conteúdo e detalhe são destino, não interrupção.
 *
 * Reaproveita StatusPill e CategoryArt do que já existe. A regra de cada um
 * continua morando onde estava — aqui só se compõe.
 */
export function DayPanel({ cell }: { cell: CalendarCell | null }) {
  if (!cell) {
    return (
      <aside className="panel flex flex-col gap-3">
        <h2 className="section-heading">Um dia de cada vez</h2>
        <p className="type-body-s text-text-muted">
          Toque num dia marcado do calendário para ver o que vocês combinaram
          para ele.
        </p>
      </aside>
    );
  }

  const instante = startOfDayInApp(cell.date);
  const titulo = `${formatWeekday(instante)}, ${formatCivilDay(cell.date)}`;

  return (
    <aside
      className="panel flex flex-col gap-5"
      aria-label={`Planos de ${titulo}`}
    >
      <div className="flex flex-col gap-1">
        <span className="type-label text-text-muted">
          {cell.isToday ? "Hoje" : "Dia selecionado"}
        </span>
        <h2 className="section-heading">{titulo}</h2>
      </div>

      {cell.entries.length === 0 ? (
        <div className="flex flex-col items-start gap-4">
          <p className="type-body-s text-text-muted">
            Esse dia ainda está livre. Dá para guardar uma ideia agora e decidir
            a data com calma depois.
          </p>
          <ButtonLink href="/novo" variant="secondary">
            <Plus aria-hidden="true" className="size-4" />
            Nova ideia
          </ButtonLink>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {cell.entries.map((entry) => {
            const riscado = statusStrikesTitle(entry.planStatus);

            return (
              <li key={entry.optionId}>
                <Link
                  href={`/planos/${entry.planId}`}
                  data-option={entry.optionId}
                  data-confirmed={entry.isConfirmed}
                  className="border-border-subtle hover:bg-surface-soft group flex items-center gap-3 rounded-md border p-2.5 transition-colors"
                >
                  <span className="bg-surface-sunken relative size-14 shrink-0 overflow-hidden rounded-sm">
                    {entry.coverMediaId ? (
                      <MediaImage
                        mediaId={entry.coverMediaId}
                        alt=""
                        variant="thumb"
                        sizes="56px"
                      />
                    ) : (
                      <CategoryArt
                        category={entry.category}
                        className="size-full min-h-0 gap-0 p-1.5 [&_p]:hidden [&_span]:hidden"
                      />
                    )}
                  </span>

                  <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span
                      className={cn(
                        "font-display line-clamp-2 text-[1.0625rem] leading-tight tracking-tight break-words",
                        riscado && "line-through",
                      )}
                    >
                      {entry.planTitle}
                    </span>
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="tnum type-meta text-text-muted">
                        {entry.allDay
                          ? "Dia inteiro"
                          : formatTime(entry.startsAt)}
                      </span>
                      <StatusPill status={entry.planStatus} />
                    </span>
                  </span>

                  <ArrowUpRight
                    aria-hidden="true"
                    className="text-text-muted size-4 shrink-0"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
