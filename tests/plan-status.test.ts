import { describe, expect, it } from "vitest";

import {
  allowedTransitions,
  assertTransition,
  canTransition,
  InvalidTransitionError,
  isTerminalStatus,
  OPEN_STATUSES,
} from "@/lib/plan-status";
import { PLAN_STATUSES, type PlanStatus } from "@/lib/status";

/** Tabela da seção 5 do docs/DATA_ACCESS.md, transcrita para o teste. */
const PERMITIDAS: readonly [PlanStatus, PlanStatus][] = [
  ["idea", "deciding"],
  ["idea", "cancelled"],
  ["deciding", "idea"],
  ["deciding", "planned"],
  ["deciding", "cancelled"],
  ["planned", "deciding"],
  ["planned", "reserved"],
  ["planned", "completed"],
  ["planned", "cancelled"],
  ["reserved", "planned"],
  ["reserved", "completed"],
  ["reserved", "cancelled"],
  ["cancelled", "idea"],
];

describe("transições permitidas", () => {
  it.each(PERMITIDAS)("%s -> %s é permitida", (from, to) => {
    expect(canTransition(from, to)).toBe(true);
    expect(() => assertTransition(from, to)).not.toThrow();
  });

  it("cobre exatamente as treze da tabela, nem uma a mais", () => {
    const total = PLAN_STATUSES.reduce(
      (soma, status) => soma + allowedTransitions(status).length,
      0,
    );
    expect(total).toBe(PERMITIDAS.length);
  });
});

describe("transições proibidas", () => {
  const PROIBIDAS: readonly [PlanStatus, PlanStatus][] = [
    ["idea", "planned"],
    ["idea", "reserved"],
    ["idea", "completed"],
    ["deciding", "reserved"],
    ["deciding", "completed"],
    ["reserved", "deciding"],
    ["cancelled", "planned"],
    ["cancelled", "completed"],
    ["completed", "idea"],
    ["completed", "planned"],
    ["completed", "cancelled"],
  ];

  it.each(PROIBIDAS)("%s -> %s é recusada", (from, to) => {
    expect(canTransition(from, to)).toBe(false);
    expect(() => assertTransition(from, to)).toThrow(InvalidTransitionError);
  });

  it("nenhum status transita para ele mesmo", () => {
    for (const status of PLAN_STATUSES) {
      expect(canTransition(status, status)).toBe(false);
    }
  });

  it("o erro carrega origem e destino, para a UI não precisar adivinhar", () => {
    try {
      assertTransition("completed", "idea");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidTransitionError);
      expect((error as InvalidTransitionError).from).toBe("completed");
      expect((error as InvalidTransitionError).to).toBe("idea");
    }
  });
});

describe("completed é terminal", () => {
  it("não tem nenhuma saída", () => {
    expect(allowedTransitions("completed")).toEqual([]);
    expect(isTerminalStatus("completed")).toBe(true);
  });

  it("é o único terminal", () => {
    const terminais = PLAN_STATUSES.filter(isTerminalStatus);
    expect(terminais).toEqual(["completed"]);
  });

  it("nenhum status alcança completed sem passar por planned ou reserved", () => {
    const origens = PLAN_STATUSES.filter((status) =>
      canTransition(status, "completed"),
    );
    expect(origens.sort()).toEqual(["planned", "reserved"]);
  });
});

describe("OPEN_STATUSES", () => {
  it("é o que a lista de Ideias mostra: nem realizado, nem cancelado", () => {
    expect([...OPEN_STATUSES]).toEqual([
      "idea",
      "deciding",
      "planned",
      "reserved",
    ]);
  });
});
