import { describe, expect, it } from "vitest";

import {
  NO_CONFIRMED_DATE,
  NO_CONFIRMED_RESERVATION,
  offerableTransitions,
  RESERVATION_HOLDS_PLAN,
  transitionBlock,
  type PlanFacts,
} from "@/lib/plan-preconditions";
import { allowedTransitions } from "@/lib/plan-status";
import { PLAN_STATUSES } from "@/lib/status";

/**
 * A regra do bloco, testada sem banco:
 *
 * > Um status só é alcançável quando o fato que ele afirma existe.
 * > E transição manual não desfaz fato de domínio.
 */
const NADA: PlanFacts = {
  hasConfirmedDate: false,
  hasConfirmedReservation: false,
};

const SO_DATA: PlanFacts = {
  hasConfirmedDate: true,
  hasConfirmedReservation: false,
};

const DATA_E_RESERVA: PlanFacts = {
  hasConfirmedDate: true,
  hasConfirmedReservation: true,
};

describe("deciding → planned exige data confirmada (do B6)", () => {
  it("recusa sem data", () => {
    expect(transitionBlock("deciding", "planned", NADA)).toBe(
      NO_CONFIRMED_DATE,
    );
  });

  it("permite com data", () => {
    expect(transitionBlock("deciding", "planned", SO_DATA)).toBeNull();
  });
});

describe("planned → reserved exige reserva confirmada", () => {
  it("recusa sem reserva", () => {
    expect(transitionBlock("planned", "reserved", SO_DATA)).toBe(
      NO_CONFIRMED_RESERVATION,
    );
  });

  it("permite com reserva", () => {
    expect(transitionBlock("planned", "reserved", DATA_E_RESERVA)).toBeNull();
  });
});

describe("reserved → planned exige que NÃO haja reserva confirmada", () => {
  it("recusa enquanto a reserva está confirmada", () => {
    expect(transitionBlock("reserved", "planned", DATA_E_RESERVA)).toBe(
      RESERVATION_HOLDS_PLAN,
    );
  });

  it("permite depois que a reserva é desfeita", () => {
    expect(transitionBlock("reserved", "planned", SO_DATA)).toBeNull();
  });

  it("a mensagem manda desfazer a reserva, não voltar para planejado", () => {
    // A do B6 dizia "Volte para Planejado antes de desmarcar a data", e aquele
    // caminho deixou de existir: o botão de voltar é que passa a ser recusado.
    expect(RESERVATION_HOLDS_PLAN).toContain("Desfaça a reserva");
    expect(RESERVATION_HOLDS_PLAN).not.toContain("Volte para");
  });
});

describe("o que não é pré-condicionado passa", () => {
  it("concluir e cancelar um plano reservado continuam livres", () => {
    expect(transitionBlock("reserved", "completed", DATA_E_RESERVA)).toBeNull();
    expect(transitionBlock("reserved", "cancelled", DATA_E_RESERVA)).toBeNull();
  });

  it("voltar de deciding para idea não depende de fato nenhum", () => {
    expect(transitionBlock("deciding", "idea", NADA)).toBeNull();
  });

  it("nenhuma outra combinação do grafo é bloqueada sem motivo", () => {
    const bloqueadas: string[] = [];

    for (const from of PLAN_STATUSES) {
      for (const to of allowedTransitions(from)) {
        if (transitionBlock(from, to, DATA_E_RESERVA) !== null) {
          bloqueadas.push(`${from} → ${to}`);
        }
      }
    }

    // Com data e reserva confirmadas, só a volta de reserved é impedida.
    expect(bloqueadas).toEqual(["reserved → planned"]);
  });
});

describe("offerableTransitions — a primeira das duas consultas", () => {
  it("é sempre subconjunto do grafo", () => {
    for (const from of PLAN_STATUSES) {
      const grafo = allowedTransitions(from);
      for (const to of offerableTransitions(from, DATA_E_RESERVA)) {
        expect(grafo).toContain(to);
      }
    }
  });

  it("não oferece planejado enquanto a reserva segura o plano", () => {
    expect(offerableTransitions("reserved", DATA_E_RESERVA)).not.toContain(
      "planned",
    );
    expect(offerableTransitions("reserved", SO_DATA)).toContain("planned");
  });

  it("não oferece reservado sem reserva confirmada", () => {
    expect(offerableTransitions("planned", SO_DATA)).not.toContain("reserved");
    expect(offerableTransitions("planned", DATA_E_RESERVA)).toContain(
      "reserved",
    );
  });

  it("não oferece planejado a partir de deciding sem data", () => {
    expect(offerableTransitions("deciding", NADA)).not.toContain("planned");
    expect(offerableTransitions("deciding", SO_DATA)).toContain("planned");
  });

  it("completed continua terminal, com ou sem fato", () => {
    expect(offerableTransitions("completed", DATA_E_RESERVA)).toEqual([]);
  });

  /**
   * O par que importa: o que a interface oferece e o que a mutation aceita são
   * a mesma função. Se divergirem, a tela mostra um botão que sempre falha.
   */
  it("oferecer e aceitar concordam em toda combinação", () => {
    for (const facts of [NADA, SO_DATA, DATA_E_RESERVA]) {
      for (const from of PLAN_STATUSES) {
        const oferecidas = offerableTransitions(from, facts);

        for (const to of allowedTransitions(from)) {
          const bloqueada = transitionBlock(from, to, facts) !== null;
          expect(oferecidas.includes(to)).toBe(!bloqueada);
        }
      }
    }
  });
});
