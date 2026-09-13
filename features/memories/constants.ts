import type { RepeatAnswer } from "@/lib/rating";

/**
 * Tetos e rótulos das memórias.
 *
 * Tetos de texto vivem na aplicação pelo mesmo motivo do D-065: mudar de ideia
 * sobre quantos caracteres cabem numa observação não pode custar migration. O
 * que é invariante — uma avaliação por pessoa, nota entre 1 e 5 — está no
 * banco desde o B2, e continua lá.
 */

/** Quantas memórias por página da timeline. */
export const MEMORIES_PER_PAGE = 24;

export const MAX_HIGHLIGHT_LENGTH = 200;

export const MAX_NOTES_LENGTH = 2000;

/**
 * Rótulos do "Repetiria?". Mesmo controle segmentado do voto do B6, rótulos
 * próprios — e o mesmo cuidado: sem ícone e sem emoji.
 *
 * O enum do banco é `repeat_answer`, separado de `vote_value` de propósito
 * desde o B2, ainda que os três valores coincidam: são perguntas diferentes, e
 * colar as duas num tipo só travaria a primeira que precisasse de um quarto
 * valor.
 */
export const REPEAT_LABELS: Readonly<Record<RepeatAnswer, string>> = {
  yes: "Com certeza",
  maybe: "Talvez",
  no: "Não",
};

/** A pergunta inteira, para a legenda do controle. */
export const REPEAT_QUESTION = "Repetiria?";
