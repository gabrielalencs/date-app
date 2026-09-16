export const PLAN_STATUSES = [
  "idea",
  "deciding",
  "planned",
  "reserved",
  "completed",
  "cancelled",
] as const;

export type PlanStatus = (typeof PLAN_STATUSES)[number];

/** Como a pill se pinta. `dot` é o ponto coral do "Decidindo". */
export type StatusTone = "neutral" | "dot" | "positive" | "muted";

const LABELS: Record<PlanStatus, string> = {
  idea: "Ideia",
  deciding: "Decidindo",
  planned: "Planejado",
  reserved: "Reservado",
  completed: "Realizado",
  cancelled: "Cancelado",
};

const TONES: Record<PlanStatus, StatusTone> = {
  idea: "muted",
  deciding: "dot",
  planned: "positive",
  reserved: "positive",
  completed: "neutral",
  cancelled: "muted",
};

export function statusLabel(status: PlanStatus): string {
  return LABELS[status];
}

export function statusTone(status: PlanStatus): StatusTone {
  return TONES[status];
}

/** Só "Reservado" carrega ícone, conforme a tabela da seção 6. */
export function statusHasIcon(status: PlanStatus): boolean {
  return status === "reserved";
}

/** "Cancelado" risca o título associado ao plano. */
export function statusStrikesTitle(status: PlanStatus): boolean {
  return status === "cancelled";
}
