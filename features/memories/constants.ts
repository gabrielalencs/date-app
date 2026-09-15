/**
 * Tetos e tamanhos do B9.
 *
 * Vivem na aplicação, e não no banco, pelo D-065: são limites de usabilidade,
 * e virar constraint significaria migration para mudar de ideia. O contraste é
 * o CHECK de 1–5 e o único em (plan_id, profile_id), que são estados
 * impossíveis e por isso ficaram no banco (seção 10 do docs/MEMORIES.md).
 */

/** "Melhor parte": uma frase, não um parágrafo. */
export const MAX_HIGHLIGHT_LENGTH = 200;

export const MAX_NOTES_LENGTH = 2000;

/**
 * Memórias por página da timeline.
 *
 * Doze fecha três linhas na grade de quatro colunas do desktop e seis no
 * tablet, sem deixar uma linha órfã pela metade no caso mais comum.
 */
export const MEMORIES_PER_PAGE = 12;
