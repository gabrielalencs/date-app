import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { memoriesHref } from "@/features/memories/url";

/**
 * Navegação entre as páginas da timeline.
 *
 * Link, não botão: cada página é uma URL de verdade e a leitura funciona sem
 * JavaScript, do mesmo jeito que o mês da agenda (seção 6). Os alvos têm 44px
 * e a extremidade vira texto em vez de link morto — um `<a>` desabilitado não
 * existe, e um link que não leva a lugar nenhum é pior que a ausência dele.
 */
export function MemoryPagination({
  page,
  pageCount,
}: {
  page: number;
  pageCount: number;
}) {
  if (pageCount <= 1) return null;

  return (
    <nav
      aria-label="Páginas das memórias"
      className="flex items-center justify-between gap-4"
    >
      {page > 1 ? (
        <Link
          href={memoriesHref(page - 1)}
          rel="prev"
          className="text-text hover:bg-surface-sunken flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          Mais recentes
        </Link>
      ) : (
        <span aria-hidden="true" />
      )}

      <p className="type-meta text-text-muted tnum" aria-live="polite">
        Página {page} de {pageCount}
      </p>

      {page < pageCount ? (
        <Link
          href={memoriesHref(page + 1)}
          rel="next"
          className="text-text hover:bg-surface-sunken flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium"
        >
          Mais antigas
          <ChevronRight aria-hidden="true" className="size-4" />
        </Link>
      ) : (
        <span aria-hidden="true" />
      )}
    </nav>
  );
}
