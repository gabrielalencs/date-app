import Link from "next/link";

import type { ActivityPage } from "@/features/activity/data/queries";
import { activityText } from "@/features/activity/presentation";
import { formatRelativeHours } from "@/lib/datetime";

export function ActivityFeed({
  planId,
  activity,
  currentProfileId,
  now,
}: {
  planId: string;
  activity: ActivityPage;
  currentProfileId: string;
  now: Date;
}) {
  return (
    <section aria-labelledby="activity-heading" className="flex flex-col gap-5">
      <div>
        <span className="type-label text-text-muted">A história deste DATE</span>
        <h2 id="activity-heading" className="section-heading mt-2">
          O que aconteceu
        </h2>
      </div>

      {activity.entries.length === 0 ? (
        <p className="type-body-s text-text-muted border-border-subtle border-y py-4">
          Ainda não aconteceu nada por aqui.
        </p>
      ) : (
        <ol className="border-border-subtle divide-border-subtle divide-y border-y">
          {activity.entries.map((event) => (
            <li
              key={event.id}
              className="grid gap-1 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline sm:gap-5"
            >
              <p className="type-body-s">
                <strong className="font-semibold">
                  {event.actorProfileId === currentProfileId
                    ? "Você"
                    : event.actorName}
                </strong>{" "}
                {activityText(event, now)}
              </p>
              <time
                dateTime={event.createdAt.toISOString()}
                className="type-meta text-text-muted whitespace-nowrap"
              >
                {formatRelativeHours(event.createdAt, now)}
              </time>
            </li>
          ))}
        </ol>
      )}

      {activity.totalPages > 1 ? (
        <nav
          aria-label="Páginas da atividade"
          className="flex items-center justify-between gap-4"
        >
          {activity.page > 1 ? (
            <Link
              className="type-body-s min-h-11 py-3 font-medium"
              href={`/planos/${planId}?pagina=${activity.page - 1}`}
            >
              Mais recentes
            </Link>
          ) : (
            <span />
          )}
          <span className="type-meta text-text-muted tnum">
            {activity.page} de {activity.totalPages}
          </span>
          {activity.page < activity.totalPages ? (
            <Link
              className="type-body-s min-h-11 py-3 font-medium"
              href={`/planos/${planId}?pagina=${activity.page + 1}`}
            >
              Mais antigos
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </section>
  );
}
