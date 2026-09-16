/**
 * Constantes compartilhadas entre a camada de dados e a interface.
 *
 * Mora fora de `data/` porque aquele módulo é `server-only`: um componente que
 * precisa saber o teto não deve depender formalmente da camada de dados, pelo
 * mesmo motivo que motivou o `features/media/contract.ts` no B5.
 */

/**
 * Teto de opções por plano. Vive na aplicação e não no schema (D-065): é limite
 * de usabilidade, não invariante de correção, e virar constraint significaria
 * migration para mudar de ideia.
 */
export const MAX_OPTIONS_PER_PLAN = 10;
