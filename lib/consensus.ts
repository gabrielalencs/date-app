/**
 * Consenso entre os dois votos de uma opção de data (seção 5 do
 * docs/DATES_AND_VOTING.md).
 *
 * Função pura, sem banco e sem contexto: é testada sozinha, e a interface a usa
 * para decidir rótulo e ênfase. Não confundir com autorização — quem pode votar
 * é decisão da camada de dados.
 */
export const VOTE_VALUES = ["yes", "maybe", "no"] as const;

export type VoteValue = (typeof VOTE_VALUES)[number];

export function isVoteValue(value: unknown): value is VoteValue {
  return (VOTE_VALUES as readonly unknown[]).includes(value);
}

/** Rótulo do controle de voto. Sem ícone e sem emoji (seção 9). */
export const VOTE_LABELS: Readonly<Record<VoteValue, string>> = {
  yes: "Sim",
  maybe: "Talvez",
  no: "Não",
};

export const CONSENSUS_STATES = [
  "both_yes",
  "leaning",
  "maybe",
  "blocked",
  "waiting",
  "untouched",
] as const;

export type ConsensusState = (typeof CONSENSUS_STATES)[number];

/**
 * Um voto por pessoa. `null` é "ainda não respondeu", que é um estado distinto
 * de ter votado `no` — a ausência não é uma recusa (seção 4).
 */
export type MemberVote = {
  profileId: string;
  displayName: string;
  vote: VoteValue | null;
};

export type Consensus = {
  state: ConsensusState;
  /** `null` em `untouched`: opção recém-criada não precisa de aviso. */
  label: string | null;
  /** Quem falta votar, quando o estado é `waiting`. */
  waitingOn: string | null;
};

/**
 * A ordem das checagens é a regra, não um detalhe de implementação:
 *
 * `blocked` vem antes de tudo porque um `no` decide sozinho — não importa o que
 * a outra pessoa votou, aquela data não serve. `waiting` vem depois dos estados
 * completos porque só faz sentido quando ainda falta alguém.
 */
export function consensusOf(votes: readonly MemberVote[]): Consensus {
  const respondidos = votes.filter((v) => v.vote !== null);

  if (respondidos.length === 0) {
    return { state: "untouched", label: null, waitingOn: null };
  }

  if (respondidos.some((v) => v.vote === "no")) {
    return { state: "blocked", label: "Alguém não pode", waitingOn: null };
  }

  const faltando = votes.filter((v) => v.vote === null);
  if (faltando.length > 0) {
    const quem = faltando[0]!.displayName;
    return { state: "waiting", label: `Falta ${quem}`, waitingOn: quem };
  }

  const sins = respondidos.filter((v) => v.vote === "yes").length;

  if (sins === respondidos.length) {
    return { state: "both_yes", label: "Vocês dois querem", waitingOn: null };
  }

  if (sins > 0) {
    return { state: "leaning", label: "Quase", waitingOn: null };
  }

  return { state: "maybe", label: "Em dúvida", waitingOn: null };
}

/**
 * Ênfase visual do estado. Cor entra como ponto ou preenchimento, nunca como
 * texto (D-020) — quem consome isto escolhe a classe, e o rótulo fica sempre
 * em `--text` ou `--text-muted`.
 */
export type ConsensusTone = "positive" | "accent" | "muted" | "danger";

export const CONSENSUS_TONE: Readonly<Record<ConsensusState, ConsensusTone>> = {
  both_yes: "positive",
  leaning: "accent",
  maybe: "muted",
  blocked: "danger",
  waiting: "muted",
  untouched: "muted",
};

/**
 * Ordem de exibição das opções: primeiro o consenso mais forte, e a data mais
 * próxima desempata. Quem decide olha "qual data a gente já concorda", não
 * "qual foi criada primeiro".
 */
const PESO: Readonly<Record<ConsensusState, number>> = {
  both_yes: 0,
  leaning: 1,
  waiting: 2,
  maybe: 3,
  untouched: 4,
  blocked: 5,
};

export function consensusRank(state: ConsensusState): number {
  return PESO[state];
}
