/**
 * A avaliação de um date realizado (seção 4 do docs/MEMORIES.md).
 *
 * Função pura, sem banco e sem contexto, pelo mesmo motivo de `lib/consensus.ts`
 * ser assim: as regras de duas pessoas opinando se testam sozinhas, e a
 * interface as consome para decidir rótulo e ênfase. Este bloco **não**
 * reinventa o que o B6 decidiu — as três regras abaixo são as mesmas da
 * votação, com outro vocabulário.
 */

/** A escala inteira. O banco recusa fora disto por CHECK; aqui é a ordem. */
export const RATING_VALUES = [1, 2, 3, 4, 5] as const;

export type RatingValue = (typeof RATING_VALUES)[number];

export function isRatingValue(value: unknown): value is RatingValue {
  return (RATING_VALUES as readonly unknown[]).includes(value);
}

/**
 * Nome acessível de cada posição do `radiogroup`.
 *
 * "3 de 5", e não "3 estrelas": quem navega por leitor de tela precisa da
 * escala junto do valor, senão "3" não diz se é bom ou ruim (seção 4).
 */
export function ratingOptionLabel(value: RatingValue): string {
  return `${value} de 5`;
}

export const REPEAT_VALUES = ["yes", "maybe", "no"] as const;

export type RepeatAnswer = (typeof REPEAT_VALUES)[number];

export function isRepeatAnswer(value: unknown): value is RepeatAnswer {
  return (REPEAT_VALUES as readonly unknown[]).includes(value);
}

/**
 * Rótulos do controle segmentado, que é o mesmo do voto do B6.
 *
 * Curtos porque a pergunta está na legenda logo acima, e porque três botões de
 * 44px com "Não repetiria" dentro não cabem numa tela de 320px sem encolher o
 * alvo de toque — e encolher o alvo não é opção.
 */
export const REPEAT_LABELS: Readonly<Record<RepeatAnswer, string>> = {
  yes: "Sim",
  maybe: "Talvez",
  no: "Não",
};

/**
 * A mesma resposta dita por extenso, para quando ela aparece longe da
 * pergunta — na avaliação da outra pessoa, onde "Sim" sozinho não diz sim a
 * quê.
 */
export const REPEAT_SUMMARY: Readonly<Record<RepeatAnswer, string>> = {
  yes: "Repetiria",
  maybe: "Talvez repetisse",
  no: "Não repetiria",
};

/**
 * A avaliação de uma pessoa. `rating` nulo é "ainda não avaliou", que é estado
 * distinto de ter dado nota baixa — a ausência não é uma reprovação (seção 4).
 */
export type MemberRating = {
  profileId: string;
  displayName: string;
  rating: RatingValue | null;
  wouldRepeat: RepeatAnswer | null;
  highlight: string | null;
  notes: string | null;
};

export type RatingSummary = {
  /**
   * Só existe quando **todas** as pessoas avaliaram.
   *
   * Com uma pessoa só, não existe média — existe a nota daquela pessoa.
   * Mostrar "4,0" quando metade do casal não respondeu é uma mentira pequena
   * que o bloco de estatísticas depois amplifica (seção 4).
   */
  average: number | null;
  /** Quantas pessoas já avaliaram. */
  answered: number;
  /** Quem ainda não avaliou, na ordem em que as pessoas aparecem. */
  waitingOn: readonly string[];
};

export function summarizeRatings(
  ratings: readonly MemberRating[],
): RatingSummary {
  const respondidas = ratings.filter((r) => r.rating !== null);
  const faltando = ratings
    .filter((r) => r.rating === null)
    .map((r) => r.displayName);

  const completa = ratings.length > 0 && faltando.length === 0;

  return {
    average: completa
      ? respondidas.reduce((soma, r) => soma + r.rating!, 0) / respondidas.length
      : null,
    answered: respondidas.length,
    waitingOn: faltando,
  };
}

/**
 * "4,5" — uma casa decimal, vírgula, e sem casa nenhuma quando é inteiro.
 *
 * `toFixed` é proibido pela zona do dinheiro do B8 e não faria falta aqui: a
 * média de duas notas inteiras tem no máximo meio ponto, então o arredondamento
 * é exato e o formato sai de uma comparação, não de uma biblioteca.
 */
export function formatAverage(average: number): string {
  const arredondada = Math.round(average * 10) / 10;
  const inteiro = Math.trunc(arredondada);
  const decimo = Math.round((arredondada - inteiro) * 10);

  return decimo === 0 ? String(inteiro) : `${inteiro},${decimo}`;
}

/** "Alex ainda não avaliou" — a ausência dita com todas as letras (seção 4). */
export function pendingLabel(displayName: string): string {
  return `${displayName} ainda não avaliou`;
}
