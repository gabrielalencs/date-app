/**
 * A avaliação de uma memória pelas duas pessoas (seção 4 do docs/MEMORIES.md).
 *
 * Função pura, sem banco e sem contexto — irmã de `lib/consensus.ts`, e pelo
 * mesmo motivo: a regra de como duas opiniões viram uma leitura é testável
 * sozinha, e a interface só a consome.
 *
 * As regras vêm inteiras do B6, porque o produto já decidiu como duas pessoas
 * opinam (D-062):
 *
 * - as duas avaliações são **sempre** visíveis;
 * - **não avaliar é estado distinto de dar nota baixa** — ausência é `null`,
 *   nunca zero;
 * - reenviar a mesma nota a retira.
 */
export const RATING_VALUES = [1, 2, 3, 4, 5] as const;

export type RatingValue = (typeof RATING_VALUES)[number];

export const MIN_RATING = 1;
export const MAX_RATING = 5;

export function isRatingValue(value: unknown): value is RatingValue {
  return (RATING_VALUES as readonly unknown[]).includes(value);
}

export const REPEAT_ANSWERS = ["yes", "maybe", "no"] as const;

export type RepeatAnswer = (typeof REPEAT_ANSWERS)[number];

export function isRepeatAnswer(value: unknown): value is RepeatAnswer {
  return (REPEAT_ANSWERS as readonly unknown[]).includes(value);
}

/**
 * A avaliação de uma pessoa. `rating` nulo é "ainda não avaliou" — o estado
 * que a seção 4 exige que apareça como ausência, e não como zero.
 */
export type MemberRating = {
  profileId: string;
  displayName: string;
  rating: RatingValue | null;
  wouldRepeat: RepeatAnswer | null;
};

/**
 * Nome acessível de cada posição do controle: "3 de 5".
 *
 * Existe porque a nota é um `radiogroup` com cinco opções, e "estrela 3" não
 * diz a escala a quem ouve o rótulo sem ver o desenho.
 */
export function ratingOptionLabel(value: RatingValue): string {
  return `${value} de ${MAX_RATING}`;
}

/**
 * A média, **e só quando todo mundo avaliou**.
 *
 * Com uma pessoa só, não existe média — existe a nota daquela pessoa. Mostrar
 * "4,0" quando metade do casal não respondeu é uma mentira pequena que o bloco
 * de estatísticas depois amplifica.
 *
 * Devolve **décimos inteiros** em vez de um número fracionário: a formatação
 * sai dos dígitos, sem passar por float, pelo mesmo motivo do `lib/money.ts`.
 * Com duas pessoas o resultado é sempre exato (x,0 ou x,5); a divisão só
 * arredonda se um dia houver um terceiro avaliador, e aí ela é declaradamente
 * de uma casa.
 */
export function averageRatingTenths(
  ratings: readonly MemberRating[],
): number | null {
  if (ratings.length === 0) return null;

  let soma = 0;

  for (const avaliacao of ratings) {
    if (avaliacao.rating === null) return null;
    soma += avaliacao.rating;
  }

  return Math.round((soma * 10) / ratings.length);
}

/** Décimos inteiros → "4,5". Monta a partir dos dígitos, sem float. */
export function formatTenths(tenths: number): string {
  if (!Number.isSafeInteger(tenths) || tenths < 0) {
    throw new RangeError("formatTenths espera décimos inteiros não negativos.");
  }

  const digitos = String(tenths).padStart(2, "0");
  return `${digitos.slice(0, -1)},${digitos.slice(-1)}`;
}

/** Quantas pessoas já avaliaram. */
export function ratingsGiven(ratings: readonly MemberRating[]): number {
  return ratings.filter((avaliacao) => avaliacao.rating !== null).length;
}

/** Quem ainda não avaliou, para a linha "Alex ainda não avaliou". */
export function waitingOnRating(
  ratings: readonly MemberRating[],
): readonly string[] {
  return ratings
    .filter((avaliacao) => avaliacao.rating === null)
    .map((avaliacao) => avaliacao.displayName);
}
