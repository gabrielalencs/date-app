/**
 * Lista canônica da seção 7 do docs/DATA_ACCESS.md (D-040).
 *
 * A coluna `plans.category` continua `text` (D-026): acrescentar categoria não
 * exige migration. Em troca, valor desconhecido vindo do banco tem de
 * renderizar como "Outro" em vez de quebrar a tela.
 */
export const CATEGORIES = [
  "gastronomia",
  "cinema_teatro",
  "musica",
  "viagem",
  "ar_livre",
  "cultura",
  "em_casa",
  "outro",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const FALLBACK_CATEGORY: Category = "outro";

const LABELS: Record<Category, string> = {
  gastronomia: "Gastronomia",
  cinema_teatro: "Cinema e teatro",
  musica: "Música",
  viagem: "Viagem",
  ar_livre: "Ar livre",
  cultura: "Cultura",
  em_casa: "Em casa",
  outro: "Outro",
};

export function isCategory(value: unknown): value is Category {
  return (
    typeof value === "string" &&
    (CATEGORIES as readonly string[]).includes(value)
  );
}

/** Nunca lança: valor desconhecido ou nulo vira a categoria de fallback. */
export function toCategory(value: unknown): Category {
  return isCategory(value) ? value : FALLBACK_CATEGORY;
}

/** Rótulo para a interface. Aceita o que vier do banco. */
export function categoryLabel(value: unknown): string {
  return LABELS[toCategory(value)];
}

export const CATEGORY_OPTIONS: readonly { value: Category; label: string }[] =
  CATEGORIES.map((value) => ({ value, label: LABELS[value] }));
