import { ExternalLink, Ticket } from "lucide-react";

import { RESERVATION_LABELS } from "@/features/planning/constants";
import {
  ReservationForm,
  ReservationStatusControl,
} from "@/features/planning/components/reservation-controls";
import type { Reservation } from "@/features/planning/data/queries";
import { cn } from "@/lib/cn";

/**
 * A seção de reserva.
 *
 * **Só existe quando tem o que mostrar** (seção 9): plano que não requer
 * reserva não vê nada aqui, e plano sem data confirmada também não — reserva
 * sem data não é reserva.
 *
 * Server Component: o estado vive nos dois controles de dentro.
 */
export function PlanReservation({
  planId,
  reservation,
  available,
  readOnly,
}: {
  planId: string;
  reservation: Reservation | null;
  /** Requer reserva, tem data confirmada e está em planned ou reserved. */
  available: boolean;
  readOnly: boolean;
}) {
  if (!available && reservation === null) return null;

  const status = reservation?.status ?? "pending";

  return (
    <section className="panel flex flex-col gap-5" aria-label="Reserva">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="section-heading flex items-center gap-3">
          <Ticket aria-hidden="true" className="size-5" strokeWidth={1.5} />
          Reserva
        </h2>
        <span
          data-reservation-status={status}
          className={cn(
            "type-meta inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1",
            status === "confirmed" && "bg-sage-soft text-text",
            status === "pending" && "bg-blush-soft text-text",
            status === "cancelled" && "bg-surface-sunken text-text-muted",
          )}
        >
          {status === "confirmed" ? (
            <span
              aria-hidden="true"
              className="bg-positive size-1.5 rounded-full"
            />
          ) : null}
          {RESERVATION_LABELS[status]}
        </span>
      </div>

      {reservation ? (
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="type-meta text-text-muted">Código</dt>
            <dd className="type-body-s tnum mt-1 break-words">
              {reservation.code ?? "Sem código"}
            </dd>
          </div>
          <div>
            <dt className="type-meta text-text-muted">Horário</dt>
            <dd className="type-body-s tnum mt-1">
              {reservation.reservedTime
                ? reservation.reservedTime.slice(0, 5)
                : "A combinar"}
            </dd>
          </div>
          {reservation.url ? (
            <div className="sm:col-span-2">
              <dt className="type-meta text-text-muted">Link</dt>
              <dd className="type-body-s mt-1">
                <a
                  href={reservation.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex min-h-11 items-center gap-2 underline underline-offset-4"
                >
                  Abrir a reserva
                  <ExternalLink aria-hidden="true" className="size-3.5" />
                </a>
              </dd>
            </div>
          ) : null}
          {reservation.notes ? (
            <div className="sm:col-span-2">
              <dt className="type-meta text-text-muted">Observações</dt>
              <dd className="type-body-s mt-1 break-words whitespace-pre-line">
                {reservation.notes}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : (
        <p className="type-body-s text-text-muted">
          Esse lugar precisa de reserva. Guardem aqui o código e o horário
          quando conseguirem.
        </p>
      )}

      {readOnly ? null : (
        <div className="flex flex-col gap-4">
          <ReservationStatusControl planId={planId} status={status} />
          <ReservationForm planId={planId} reservation={reservation} />
        </div>
      )}
    </section>
  );
}
