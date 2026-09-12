import Link from "next/link";

import {
  cellAccessibleName,
  type CalendarCell,
  type CalendarEntry,
} from "@/features/calendar/grid";
import { agendaHref } from "@/features/calendar/url";
import { cn } from "@/lib/cn";
import {
  formatCivilDay,
  formatMonthTitle,
  formatTime,
  WEEKDAY_HEADERS,
  type CivilMonth,
} from "@/lib/datetime";

/**
 * A grade do mês.
 *
 * É `<table>` e não `<div role="grid">` porque o dado é tabular de verdade:
 * linhas são semanas, colunas são dias da semana (seção 10). Leitor de tela
 * anuncia a coluna sozinho, e não há atalho de teclado próprio a inventar —
 * são links, Tab basta.
 *
 * Server Component: não há estado nenhum aqui, só links.
 */

const LINHAS = 6;
const COLUNAS = 7;
const MAX_VISIVEIS = 3;

/** Ponto preenchido para confirmada, contornado para candidata (seção 8). */
function Marker({ entry }: { entry: CalendarEntry }) {
  return (
    <span
      aria-hidden="true"
      data-confirmed={entry.isConfirmed}
      className={cn(
        "calendar-marker",
        entry.isConfirmed ? "text-accent" : "text-text-muted",
      )}
    />
  );
}

function Celula({
  cell,
  month,
  selectedDay,
  category,
}: {
  cell: CalendarCell;
  month: CivilMonth;
  selectedDay: string | null;
  category: string | null;
}) {
  const rotuloDoDia = formatCivilDay(cell.date);
  const nomeAcessivel = cellAccessibleName(cell, rotuloDoDia);
  const temConteudo = cell.entries.length > 0;
  const sobrando = cell.entries.length - MAX_VISIVEIS;

  const miolo = (
    <>
      <span className="calendar-daynum">{cell.date.day}</span>

      {/* Mobile: só marcadores. Desktop: rótulo curto ao lado do marcador. */}
      <span className="calendar-markers md:hidden">
        {cell.entries.slice(0, MAX_VISIVEIS).map((entry) => (
          <Marker key={entry.optionId} entry={entry} />
        ))}
        {sobrando > 0 ? (
          <span className="calendar-more">+{sobrando}</span>
        ) : null}
      </span>

      <span className="hidden min-w-0 flex-col gap-0.5 md:flex">
        {cell.entries.slice(0, MAX_VISIVEIS).map((entry) => (
          <span key={entry.optionId} className="calendar-entry">
            <Marker entry={entry} />
            <span className={cn(entry.isConfirmed && "font-medium")}>
              {entry.allDay ? entry.planTitle : formatTime(entry.startsAt)}
            </span>
          </span>
        ))}
        {sobrando > 0 ? (
          <span className="calendar-more">
            +{sobrando} {sobrando === 1 ? "outro" : "outros"}
          </span>
        ) : null}
      </span>
    </>
  );

  const atributos = {
    "data-day": cell.key,
    "data-outside": !cell.inMonth,
    "data-today": cell.isToday,
    "data-selected": cell.key === selectedDay,
    "data-entries": cell.entries.length,
  } as const;

  return (
    <td
      className="calendar-cell"
      aria-current={cell.isToday ? "date" : undefined}
    >
      {/* Só célula com conteúdo é link (D-077): 42 células linkáveis seriam 42
          paradas de tabulação antes do resto da página, e dia sem nada não tem
          detalhe para abrir. */}
      {temConteudo ? (
        <Link
          {...atributos}
          href={agendaHref({ month, day: cell.key, category })}
          aria-label={nomeAcessivel}
          className="calendar-day"
        >
          {miolo}
        </Link>
      ) : (
        <span {...atributos} className="calendar-day">
          <span className="sr-only">{rotuloDoDia}</span>
          <span aria-hidden="true" className="calendar-daynum">
            {cell.date.day}
          </span>
        </span>
      )}
    </td>
  );
}

export function MonthGrid({
  month,
  cells,
  selectedDay,
  category,
}: {
  month: CivilMonth;
  cells: readonly CalendarCell[];
  selectedDay: string | null;
  category: string | null;
}) {
  const semanas = Array.from({ length: LINHAS }, (_, i) =>
    cells.slice(i * COLUNAS, i * COLUNAS + COLUNAS),
  );

  return (
    <div className="calendar-bleed">
      <table className="calendar-table">
        <caption className="sr-only">
          Calendário de {formatMonthTitle(month)}
        </caption>
        <thead>
          <tr>
            {WEEKDAY_HEADERS.map((dia) => (
              <th key={dia.short} scope="col" className="calendar-weekday">
                <abbr title={dia.long}>{dia.short}</abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {semanas.map((semana, i) => (
            <tr key={i}>
              {semana.map((cell) => (
                <Celula
                  key={cell.key}
                  cell={cell}
                  month={month}
                  selectedDay={selectedDay}
                  category={category}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
