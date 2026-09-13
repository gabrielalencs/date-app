import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { memoriesHref } from "@/features/memories/timeline";

/**
 * Anterior e seguinte são **links**, como o mês da agenda (D-078).
 *
 * Cada página é uma URL de verdade: recarregar funciona, compartilhar funciona,
 * o histórico se comporta e a leitura não depende de JavaScript.
 *
 * Paginação por número, e não por cursor. Cursor seria mais correto num feed
 * vivo, mas esta lista é de passado e praticamente imóvel — um plano só entra
 * nela quando alguém marca um date como realizado, o que acontece uma vez por
 * date. Cursor composto de instante mais id numa URL é feio e não compra nada.
 */
export function TimelineNav({
  page,
  hasPrevious,
  hasNext,
}: {
  page: number;
  hasPrevious: boolean;
  hasNext: boolean;
}) {
  if (!hasPrevious && !hasNext) return null;

  const link =
    "border-border-subtle text-text hover:bg-surface-soft type-meta inline-flex min-h-11 items-center gap-2 rounded-full border px-4 transition-colors";

  return (
    <nav
      aria-label="Páginas das memórias"
      className="flex flex-wrap items-center justify-between gap-3"
    >
      {hasPrevious ? (
        <Link href={memoriesHref(page - 1)} className={link}>
          <ChevronLeft aria-hidden="true" className="size-4" />
          Mais recentes
        </Link>
      ) : (
        <span />
      )}

      {hasNext ? (
        <Link href={memoriesHref(page + 1)} className={link}>
          Mais antigas
          <ChevronRight aria-hidden="true" className="size-4" />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
