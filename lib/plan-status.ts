import { PLAN_STATUSES, type PlanStatus } from "@/lib/status";

/**
 * Máquina de status da seção 5 do docs/DATA_ACCESS.md. Pura: sem banco, sem
 * contexto, testável sozinha, e usada tanto pelo servidor quanto pela UI que
 * decide quais botões existem.
 *
 * `completed` é terminal de propósito: desfazer um date realizado apagaria a
 * memória associada.
 */
const TRANSITIONS: Record<PlanStatus, readonly PlanStatus[]> = {
  idea: ["deciding", "cancelled"],
  deciding: ["idea", "planned", "cancelled"],
  planned: ["deciding", "reserved", "completed", "cancelled"],
  reserved: ["planned", "completed", "cancelled"],
  completed: [],
  cancelled: ["idea"],
};

export class InvalidTransitionError extends Error {
  readonly from: PlanStatus;
  readonly to: PlanStatus;

  constructor(from: PlanStatus, to: PlanStatus) {
    super(`Transição de "${from}" para "${to}" não é permitida.`);
    this.name = "InvalidTransitionError";
    this.from = from;
    this.to = to;
  }
}

export function allowedTransitions(from: PlanStatus): readonly PlanStatus[] {
  return TRANSITIONS[from];
}

export function canTransition(from: PlanStatus, to: PlanStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Lança em vez de virar no-op silencioso. */
export function assertTransition(from: PlanStatus, to: PlanStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}

export function isTerminalStatus(status: PlanStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

/** Status que ainda não viraram date realizado — a lista de Ideias. */
export const OPEN_STATUSES: readonly PlanStatus[] = PLAN_STATUSES.filter(
  (status) => status !== "completed" && status !== "cancelled",
);
