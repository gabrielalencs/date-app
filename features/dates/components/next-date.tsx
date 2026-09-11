import Link from "next/link";
import { MapPin } from "lucide-react";

import type { ConfirmedDate } from "@/features/dates/data/queries";
import { MediaImage } from "@/features/media/components/media-image";
import { formatDateTime, formatRelativeDay } from "@/lib/datetime";

/**
 * O próximo DATE na Home (seção 9).
 *
 * A contagem é calculada no servidor e renderizada como **texto estático**.
 * Não conta segundos: além de ser animação gratuita, um contador no cliente
 * divergiria do servidor e produziria erro de hidratação.
 *
 * "Próximo" é dia civil, não instante — um date marcado para hoje às 20h
 * continua sendo o próximo às 23h (D-061).
 */
export function NextDate({ next, now }: { next: ConfirmedDate; now: Date }) {
  const local = next.placeName ?? next.city;

  return (
    <section className="flex flex-col gap-4">
      <h2 className="type-label text-text-muted">Próximo DATE</h2>

      <Link
        href={`/planos/${next.planId}`}
        className="border-border-subtle bg-surface ease-standard hover:border-border-strong group flex flex-col overflow-hidden rounded-lg border transition-[opacity,transform] duration-[var(--duration-micro)] active:scale-[0.995]"
      >
        {next.coverMediaId ? (
          <div className="relative aspect-4/5 w-full overflow-hidden sm:aspect-16/9">
            <MediaImage
              mediaId={next.coverMediaId}
              alt={next.planTitle}
              priority
              sizes="(min-width: 1024px) 64rem, 100vw"
            />
          </div>
        ) : null}

        <div className="flex flex-col gap-2 p-5">
          <span className="type-label text-text-muted">
            {formatRelativeDay(next.startsAt, now)}
          </span>

          <p className="type-display-l text-text">{next.planTitle}</p>

          <p className="type-body text-text-muted tnum">
            {formatDateTime(next.startsAt, { allDay: next.allDay, now })}
          </p>

          {local ? (
            <p className="type-body-s text-text-muted inline-flex items-center gap-1.5">
              <MapPin
                aria-hidden="true"
                className="size-4"
                strokeWidth={1.75}
              />
              {local}
            </p>
          ) : null}
        </div>
      </Link>
    </section>
  );
}
