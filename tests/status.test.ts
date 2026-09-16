import { describe, expect, it } from "vitest";

import {
  PLAN_STATUSES,
  statusHasIcon,
  statusLabel,
  statusStrikesTitle,
  statusTone,
} from "@/lib/status";

describe("statusLabel", () => {
  it("usa os rótulos em português da tabela da seção 6", () => {
    expect(statusLabel("idea")).toBe("Ideia");
    expect(statusLabel("deciding")).toBe("Decidindo");
    expect(statusLabel("planned")).toBe("Planejado");
    expect(statusLabel("reserved")).toBe("Reservado");
    expect(statusLabel("completed")).toBe("Realizado");
    expect(statusLabel("cancelled")).toBe("Cancelado");
  });

  it("cobre os seis status do produto", () => {
    expect(PLAN_STATUSES).toHaveLength(6);
    for (const status of PLAN_STATUSES) {
      expect(statusLabel(status)).not.toBe("");
    }
  });
});

describe("statusTone", () => {
  it("dá ponto coral só para Decidindo", () => {
    expect(statusTone("deciding")).toBe("dot");
    const others = PLAN_STATUSES.filter((s) => s !== "deciding");
    for (const status of others) {
      expect(statusTone(status)).not.toBe("dot");
    }
  });

  it("marca planejado e reservado como positivo", () => {
    expect(statusTone("planned")).toBe("positive");
    expect(statusTone("reserved")).toBe("positive");
  });

  it("apaga ideia e cancelado", () => {
    expect(statusTone("idea")).toBe("muted");
    expect(statusTone("cancelled")).toBe("muted");
  });
});

describe("sinais extras", () => {
  it("só Reservado carrega ícone", () => {
    expect(statusHasIcon("reserved")).toBe(true);
    for (const status of PLAN_STATUSES.filter((s) => s !== "reserved")) {
      expect(statusHasIcon(status)).toBe(false);
    }
  });

  it("só Cancelado risca o título", () => {
    expect(statusStrikesTitle("cancelled")).toBe(true);
    for (const status of PLAN_STATUSES.filter((s) => s !== "cancelled")) {
      expect(statusStrikesTitle(status)).toBe(false);
    }
  });
});
