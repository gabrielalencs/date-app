import Link from "next/link";

import type { ConfirmedDate } from "@/features/dates/data/queries";
import { formatDateTime, formatRelativeDay } from "@/lib/datetime";

/**
 * Os próximos DATEs confirmados, ao lado da grade.
 *
 * Consome `listUpcomingConfirmed`, a mesma função que a Home usa com limite 1
 * (seção 4 do docs/CALENDAR.md). Duas consultas quase iguais divergem em seis
 * meses, então existe uma só.
 *
 * A distância em dias é calculada no servidor e renderizada como texto
 * estático: contador no cliente diverge do servidor e produz erro de
 * hidratação.
 */
export function UpcomingBand({
  dates,
  now,
}: {
  dates: readonly ConfirmedDate[];
  now: Date;
}) {
  if (dates.length === 0) return null;

  return (
    <section className="panel flex flex-col gap-4" aria-label="Próximos DATEs">
      <h2 className="section-heading">O que vem por aí</h2>

      <ul className="flex flex-col gap-3">
        {dates.map((date) => (
          <li key={date.optionId}>
            <Link
              href={`/planos/${date.planId}`}
              data-upcoming={date.optionId}
              className="hover:bg-surface-soft -mx-2 flex flex-col gap-1 rounded-md px-2 py-2 transition-colors"
            >
              <span className="font-display line-clamp-2 text-[1.0625rem] leading-tight tracking-tight break-words">
                {date.planTitle}
              </span>
              <span className="type-meta text-text-muted tnum">
                {formatDateTime(date.startsAt, {
                  allDay: date.allDay,
                  now,
                })}
                {" · "}
                {formatRelativeDay(date.startsAt, now)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
