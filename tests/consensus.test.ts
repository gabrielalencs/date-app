import { describe, expect, it } from "vitest";

import {
  CONSENSUS_STATES,
  CONSENSUS_TONE,
  VOTE_VALUES,
  consensusOf,
  consensusRank,
  isVoteValue,
  type MemberVote,
  type VoteValue,
} from "@/lib/consensus";

/** Os dois do workspace. O consenso nunca inventa uma terceira pessoa. */
function votos(
  a: VoteValue | null,
  b: VoteValue | null,
): readonly MemberVote[] {
  return [
    { profileId: "p-alex", displayName: "Alex", vote: a },
    { profileId: "p-nina", displayName: "Nina", vote: b },
  ];
}

describe("os seis estados da seção 5", () => {
  it("both_yes quando os dois querem", () => {
    expect(consensusOf(votos("yes", "yes"))).toEqual({
      state: "both_yes",
      label: "Vocês dois querem",
      waitingOn: null,
    });
  });

  it("leaning quando um quer e o outro talvez, nas duas ordens", () => {
    for (const v of [votos("yes", "maybe"), votos("maybe", "yes")]) {
      expect(consensusOf(v)).toMatchObject({
        state: "leaning",
        label: "Quase",
      });
    }
  });

  it("maybe quando os dois estão em dúvida", () => {
    expect(consensusOf(votos("maybe", "maybe"))).toMatchObject({
      state: "maybe",
      label: "Em dúvida",
    });
  });

  it("blocked quando alguém não pode", () => {
    for (const v of [
      votos("no", "yes"),
      votos("yes", "no"),
      votos("no", "maybe"),
      votos("no", "no"),
      votos("no", null),
    ]) {
      expect(consensusOf(v)).toMatchObject({
        state: "blocked",
        label: "Alguém não pode",
      });
    }
  });

  it("waiting nomeia quem falta", () => {
    expect(consensusOf(votos("yes", null))).toEqual({
      state: "waiting",
      label: "Falta Nina",
      waitingOn: "Nina",
    });

    expect(consensusOf(votos(null, "maybe"))).toEqual({
      state: "waiting",
      label: "Falta Alex",
      waitingOn: "Alex",
    });
  });

  it("untouched não exibe rótulo", () => {
    expect(consensusOf(votos(null, null))).toEqual({
      state: "untouched",
      label: null,
      waitingOn: null,
    });
  });
});

describe("a ordem das checagens é a regra", () => {
  it("um 'não' decide sozinho, mesmo faltando a outra pessoa votar", () => {
    // Se waiting viesse antes, isto diria "Falta Nina" e esconderia a recusa.
    expect(consensusOf(votos("no", null)).state).toBe("blocked");
  });

  it("não votar não é votar 'não'", () => {
    expect(consensusOf(votos("yes", null)).state).toBe("waiting");
    expect(consensusOf(votos("yes", "no")).state).toBe("blocked");
  });
});

describe("propriedades", () => {
  it("toda combinação possível devolve um estado conhecido", () => {
    const valores: readonly (VoteValue | null)[] = [...VOTE_VALUES, null];

    for (const a of valores) {
      for (const b of valores) {
        const { state } = consensusOf(votos(a, b));
        expect(CONSENSUS_STATES).toContain(state);
      }
    }
  });

  it("o resultado não depende da ordem das pessoas, exceto por quem falta", () => {
    const valores: readonly (VoteValue | null)[] = [...VOTE_VALUES, null];

    for (const a of valores) {
      for (const b of valores) {
        expect(consensusOf(votos(a, b)).state).toBe(
          consensusOf(votos(b, a)).state,
        );
      }
    }
  });

  it("todo estado tem tom e peso definidos", () => {
    for (const state of CONSENSUS_STATES) {
      expect(CONSENSUS_TONE[state]).toBeDefined();
      expect(Number.isInteger(consensusRank(state))).toBe(true);
    }
  });

  it("both_yes ordena antes de tudo e blocked por último", () => {
    const ordenados = [...CONSENSUS_STATES].sort(
      (x, y) => consensusRank(x) - consensusRank(y),
    );

    expect(ordenados[0]).toBe("both_yes");
    expect(ordenados.at(-1)).toBe("blocked");
  });
});

describe("isVoteValue", () => {
  it("aceita os três e recusa o resto", () => {
    for (const v of VOTE_VALUES) expect(isVoteValue(v)).toBe(true);
    for (const v of ["sim", "YES", "", null, undefined, 1, {}]) {
      expect(isVoteValue(v)).toBe(false);
    }
  });
});
