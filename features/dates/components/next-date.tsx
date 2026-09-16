import Link from "next/link";
import { ArrowUpRight, CalendarDays, MapPin } from "lucide-react";
import { Horizon } from "@/components/brand/editorial";
import type { ConfirmedDate } from "@/features/dates/data/queries";
import { MediaImage } from "@/features/media/components/media-image";
import { formatDateTime, formatRelativeDay } from "@/lib/datetime";

/** Contagem no servidor, sempre no fuso do produto. */
export function NextDate({ next, now }: { next: ConfirmedDate; now: Date }) {
  const local = next.placeName ?? next.city;
  return (
    <section className="flex flex-col gap-4">
      <h2 className="type-label text-text-muted">Próximo DATE</h2>
      <Link
        href={`/planos/${next.planId}`}
        className="border-border-subtle bg-surface group interactive-lift flex flex-1 flex-col overflow-hidden rounded-lg border sm:flex-row"
      >
        <div className="relative aspect-video w-full shrink-0 overflow-hidden sm:aspect-square sm:w-2/5">
          {next.coverMediaId ? (
            <MediaImage
              mediaId={next.coverMediaId}
              alt={next.planTitle}
              priority
              sizes="(min-width: 1024px) 300px, 90vw"
              className="photo-zoom"
            />
          ) : (
            <div className="plan-art bg-mist-soft flex h-full flex-col items-center justify-center gap-4 p-5">
              <CalendarDays
                aria-hidden="true"
                className="size-12"
                strokeWidth={1}
              />
              <span className="type-label text-center">Um dia para vocês</span>
              <Horizon />
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col justify-center gap-3 p-5 sm:p-7">
          <span className="type-meta bg-sage-soft w-fit rounded-full px-3 py-1">
            {formatRelativeDay(next.startsAt, now)}
          </span>
          <p className="type-title break-words">{next.planTitle}</p>
          <p className="type-body-s text-text-muted tnum flex items-start gap-2">
            <CalendarDays
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0"
            />
            {formatDateTime(next.startsAt, { allDay: next.allDay, now })}
          </p>
          {local ? (
            <p className="type-body-s text-text-muted flex items-center gap-2">
              <MapPin aria-hidden="true" className="size-4 shrink-0" />
              {local}
            </p>
          ) : null}
          <span className="type-meta mt-2 flex items-center gap-2">
            Ver o plano
            <ArrowUpRight aria-hidden="true" className="size-4" />
          </span>
        </div>
      </Link>
    </section>
  );
}
