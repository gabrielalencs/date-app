/**
 * Dois eixos, não uma pilha de botões.
 *
 * Até o R2 a seção de reações eram dois interruptores empilhados — "Favoritar"
 * e "Quero muito", um debaixo do outro, com a mesma forma e o mesmo peso. Lidos
 * assim, parecem a mesma pergunta feita duas vezes, e nenhum dos dois responde
 * o que a outra pessoa quer saber ao abrir um plano: **o que você achou disso?**
 *
 * Então eles se separam:
 *
 * - **favorito** é organização pessoal e silenciosa ("quero achar isso depois").
 *   Continua sendo um marcador que liga e desliga, e é o que alimenta o filtro
 *   de /ideias. Não é opinião e não diz nada à outra pessoa.
 * - **opinião** é a resposta ao rolê. É uma escolha só, exclusiva, na forma do
 *   voto de data: uma fileira de respostas, a sua marcada, a da outra pessoa ao
 *   lado. Responder de novo a mesma coisa retira, como o voto.
 */

/**
 * A escala, do topo para o fim. A ordem aqui é a ordem na tela.
 *
 * `want_a_lot` é o nome de nascença do topo, hoje rotulado "Amei" — a nota em
 * `db/schema/enums.ts` explica por que o valor não foi renomeado no banco.
 */
export const OPINION_TYPES = ["want_a_lot", "like", "meh", "pass"] as const;

export type OpinionType = (typeof OPINION_TYPES)[number];

export const REACTION_TYPES = ["favorite", ...OPINION_TYPES] as const;

export type ReactionType = (typeof REACTION_TYPES)[number];

/**
 * O topo da escala é o único que fala com a outra pessoa: emite evento no feed
 * e vira notificação. Os outros três são resposta, não chamado — "curti" não
 * merece acordar ninguém, e "não curti" muito menos.
 */
export const TOP_OPINION = "want_a_lot" satisfies OpinionType;

export function isOpinion(type: ReactionType): type is OpinionType {
  return type !== "favorite";
}

/** Primeira pessoa: o que o botão oferece. */
export const OPINION_LABEL: Record<OpinionType, string> = {
  want_a_lot: "Amei",
  like: "Curti",
  meh: "Tanto faz",
  pass: "Não curti",
};

/** Terceira pessoa: o que se lê na linha da outra pessoa. */
export const OPINION_SAID: Record<OpinionType, string> = {
  want_a_lot: "amou",
  like: "curtiu",
  meh: "tanto faz",
  pass: "não curtiu",
};

/**
 * A cor de fundo do chip marcado. Só os extremos ganham cor: o meio da escala é
 * literalmente indiferença, e pintá-la seria dar ênfase a quem não tem.
 */
export const OPINION_TONE: Record<OpinionType, string> = {
  want_a_lot: "bg-blush-soft border-blush-soft",
  like: "bg-sage-soft border-sage-soft",
  meh: "bg-surface-sunken border-border-strong",
  pass: "bg-surface-sunken border-border-strong",
};
