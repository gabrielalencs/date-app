import Link from "next/link";

import { agendaHref } from "@/features/calendar/url";
import { CATEGORY_OPTIONS } from "@/lib/categories";
import { cn } from "@/lib/cn";
import type { CivilMonth } from "@/lib/datetime";

/**
 * Filtro por categoria, em links — não em Select.
 *
 * A agenda é navegação (D-078), e um Select exigiria JavaScript para uma coisa
 * que uma âncora faz. É também o que a prancha de marca mostra: uma fila de
 * chips com "Todos" na frente.
 *
 * O dia sai da URL ao trocar de filtro: o dia selecionado pode não ter mais
 * nada depois do filtro, e um painel vazio sem explicação é pior que nenhum.
 */
export function CategoryFilter({
  month,
  selected,
}: {
  month: CivilMonth;
  selected: string | null;
}) {
  const opcoes = [{ value: null, label: "Todas" }, ...CATEGORY_OPTIONS];

  return (
    <nav aria-label="Filtrar por categoria">
      {/* Rola no mobile em vez de quebrar em quatro linhas antes da grade. O
          `chip-rail` cuida do respiro e da barra de rolagem, que no Android
          nascia encostada nos chips. */}
      <ul className="chip-rail chip-rail-faded -mx-1 flex snap-x gap-2 overflow-x-auto px-1">
        {opcoes.map((opcao) => {
          const ativa = opcao.value === selected;

          return (
            <li key={opcao.value ?? "todas"} className="snap-start">
              <Link
                href={agendaHref({ month, category: opcao.value })}
                aria-current={ativa ? "true" : undefined}
                data-category={opcao.value ?? "todas"}
                className={cn(
                  "type-meta inline-flex min-h-11 items-center rounded-full border px-4 whitespace-nowrap transition-colors",
                  ativa
                    ? "border-brand bg-brand text-brand-fg"
                    : "border-border-subtle text-text-muted hover:bg-surface-soft hover:text-text",
                )}
              >
                {opcao.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
