import { describe, expect, it } from "vitest";

import { NOTIFICATION_KINDS } from "@/features/notifications/kinds";
import { dedupeKeyFor } from "@/features/notifications/policy/dedupe";
import {
  deepLinkFor,
  isSafeInternalPath,
} from "@/features/notifications/policy/links";
import {
  preferenceGateFor,
  recipientsFor,
} from "@/features/notifications/policy/recipients";
import {
  shouldSend,
  type Expected,
  type PlanFacts,
} from "@/features/notifications/policy/revalidate";
import { classifyPushStatus } from "@/features/notifications/send/sender";
import {
  renderNotification,
  variantIndex,
} from "@/features/notifications/templates";

/**
 * A política do B11.5, inteira, sem banco e sem rede.
 *
 * Todas as decisões do bloco são funções puras de propósito — é o que permite
 * provar a matriz completa aqui e deixar o workflow com o papel de só executar
 * o que estas funções mandam.
 */

const ALEX = "profile_alex";
const NINA = "profile_nina";
const MEMBROS = [ALEX, NINA];

/** Um plano vivo, planejado, com data confirmada. O resto sobrescreve. */
function facts(patch: Partial<PlanFacts> = {}): PlanFacts {
  return {
    exists: true,
    title: "Jantar no Centro",
    status: "planned",
    archived: false,
    confirmedOptionId: "opt-1",
    confirmedDayKey: "2026-10-03",
    confirmedStartsAt: new Date("2026-10-03T23:00:00.000Z"),
    reservationStatus: null,
    actorWantsALot: true,
    actorOpenOptionCount: 1,
    actorVote: "yes",
    actorRatingExists: true,
    ...patch,
  };
}

describe("destinatário", () => {
  it("nunca é o próprio ator", () => {
    for (const kind of NOTIFICATION_KINDS) {
      if (kind === "date_reminder") continue;
      const destinos = recipientsFor({
        kind,
        memberProfileIds: MEMBROS,
        actorProfileId: ALEX,
      });
      expect(destinos, kind).toEqual([NINA]);
    }
  });

  it("lembrete vai para os dois", () => {
    expect(
      recipientsFor({
        kind: "date_reminder",
        memberProfileIds: MEMBROS,
        actorProfileId: null,
      }),
    ).toEqual(MEMBROS);
  });

  it("workspace só com o ator não notifica ninguém", () => {
    expect(
      recipientsFor({
        kind: "plan_created",
        memberProfileIds: [ALEX],
        actorProfileId: ALEX,
      }),
    ).toEqual([]);
  });

  it("cada kind responde a um interruptor do Perfil", () => {
    expect(preferenceGateFor("date_reminder")).toBe("dateRemindersEnabled");
    expect(preferenceGateFor("plan_created")).toBe("activityEnabled");
  });
});

describe("chave de dedupe", () => {
  it("datas e votos agregam por plano e por ator", () => {
    const a = dedupeKeyFor({
      kind: "date_suggested",
      planId: "p1",
      actorProfileId: ALEX,
    });
    const b = dedupeKeyFor({
      kind: "date_suggested",
      planId: "p1",
      actorProfileId: NINA,
    });

    /* Quatro datas do mesmo ator colidem — é o debounce. Datas de pessoas
       diferentes não podem colidir, senão a segunda silencia a primeira. */
    expect(a).toBe(
      dedupeKeyFor({
        kind: "date_suggested",
        planId: "p1",
        actorProfileId: ALEX,
      }),
    );
    expect(a).not.toBe(b);
  });

  it("os quatro lembretes do mesmo date têm chaves distintas", () => {
    const chaves = [7, 5, 3, 1].map((offsetDays) =>
      dedupeKeyFor({
        kind: "date_reminder",
        planId: "p1",
        offsetDays: offsetDays as 7 | 5 | 3 | 1,
      }),
    );
    expect(new Set(chaves).size).toBe(4);
  });

  it("o resto agrega por plano", () => {
    expect(dedupeKeyFor({ kind: "want_a_lot", planId: "p1" })).toBe(
      dedupeKeyFor({ kind: "want_a_lot", planId: "p1" }),
    );
    expect(dedupeKeyFor({ kind: "want_a_lot", planId: "p1" })).not.toBe(
      dedupeKeyFor({ kind: "plan_archived", planId: "p1" }),
    );
  });
});

describe("revalidação: o estado desfeito não vira push", () => {
  const esperado: Expected = {
    confirmedOptionId: "opt-1",
    dayKey: "2026-10-03",
    optionId: "opt-1",
    vote: "yes",
    reservationStatus: "confirmed",
    offsetDays: 1,
  };

  it("nova ideia some se o plano foi arquivado antes do prazo", () => {
    expect(
      shouldSend("plan_created", esperado, facts({ archived: true })),
    ).toMatchObject({ send: false });
  });

  it("nova ideia some se o plano foi cancelado antes do prazo", () => {
    expect(
      shouldSend("plan_created", esperado, facts({ status: "cancelled" })),
    ).toMatchObject({ send: false });
  });

  it("quero muito some se a reação foi retirada", () => {
    expect(
      shouldSend("want_a_lot", esperado, facts({ actorWantsALot: false })),
    ).toMatchObject({ send: false });
    expect(shouldSend("want_a_lot", esperado, facts())).toEqual({ send: true });
  });

  it("voto mudado envia o estado final e nada mais", () => {
    expect(
      shouldSend("vote_cast", { ...esperado, vote: "maybe" }, facts()),
    ).toMatchObject({ send: false });
    expect(
      shouldSend("vote_cast", esperado, facts({ actorVote: null })),
    ).toMatchObject({ send: false });
    expect(shouldSend("vote_cast", esperado, facts())).toEqual({ send: true });
  });

  it("confirmar A e depois B suprime o aviso de A", () => {
    expect(
      shouldSend(
        "date_confirmed",
        esperado,
        facts({ confirmedOptionId: "opt-2" }),
      ),
    ).toMatchObject({ send: false });
  });

  it("mesma opção em outro dia também suprime", () => {
    expect(
      shouldSend(
        "date_confirmed",
        esperado,
        facts({ confirmedDayKey: "2026-10-04" }),
      ),
    ).toMatchObject({ send: false });
  });

  it("reservar depois de confirmar não desmente o aviso de data", () => {
    /* `reserved` é `planned` com reserva: a frase "está planejado" continua
       verdadeira, e suprimir aqui seria zelo demais. */
    expect(
      shouldSend("date_confirmed", esperado, facts({ status: "reserved" })),
    ).toEqual({ send: true });
  });

  it("reserva desfeita antes da hora suprime o aviso de confirmada", () => {
    expect(
      shouldSend(
        "booking_updated",
        esperado,
        facts({ reservationStatus: "pending" }),
      ),
    ).toMatchObject({ send: false });
    expect(
      shouldSend(
        "booking_updated",
        esperado,
        facts({ reservationStatus: "confirmed" }),
      ),
    ).toEqual({ send: true });
  });

  it("cancelamento revertido antes do prazo suprime", () => {
    expect(
      shouldSend("plan_cancelled", esperado, facts({ status: "planned" })),
    ).toMatchObject({ send: false });
    expect(
      shouldSend("plan_cancelled", esperado, facts({ status: "cancelled" })),
    ).toEqual({ send: true });
  });

  it("desarquivar antes do prazo suprime", () => {
    expect(
      shouldSend("plan_archived", esperado, facts({ archived: false })),
    ).toMatchObject({ send: false });
    expect(
      shouldSend("plan_archived", esperado, facts({ archived: true })),
    ).toEqual({ send: true });
  });

  it("avaliação retirada antes do prazo suprime", () => {
    expect(
      shouldSend(
        "memory_added",
        esperado,
        facts({ status: "completed", actorRatingExists: false }),
      ),
    ).toMatchObject({ send: false });
  });

  it("lembrete não sai se a data mudou, foi desconfirmada ou o date acabou", () => {
    expect(
      shouldSend(
        "date_reminder",
        esperado,
        facts({ confirmedOptionId: null }),
      ),
    ).toMatchObject({ send: false });
    expect(
      shouldSend(
        "date_reminder",
        esperado,
        facts({ confirmedDayKey: "2026-10-05" }),
      ),
    ).toMatchObject({ send: false });
    expect(
      shouldSend("date_reminder", esperado, facts({ status: "completed" })),
    ).toMatchObject({ send: false });
    expect(shouldSend("date_reminder", esperado, facts())).toEqual({
      send: true,
    });
  });

  it("plano apagado suprime qualquer kind", () => {
    for (const kind of NOTIFICATION_KINDS) {
      expect(
        shouldSend(kind, esperado, facts({ exists: false })),
        kind,
      ).toMatchObject({ send: false });
    }
  });
});

describe("copy", () => {
  it("private não vaza título nem data", () => {
    const privada = renderNotification({
      kind: "date_confirmed",
      facts: { planTitle: "Jantar no Centro", dateLabel: "sábado, 3 de outubro" },
      previewMode: "private",
      seed: "intent-1",
    });

    expect(privada.title).toBe("Tem novidade no DATE");
    expect(`${privada.title} ${privada.body}`).not.toContain("Jantar");
    expect(`${privada.title} ${privada.body}`).not.toContain("outubro");
  });

  it("private distingue lembrete de atividade", () => {
    const lembrete = renderNotification({
      kind: "date_reminder",
      facts: { planTitle: "Jantar", offsetDays: 1 },
      previewMode: "private",
      seed: "x",
    });
    expect(lembrete.title).toBe("Vocês têm um date chegando");
  });

  it("full usa o contexto", () => {
    const cheia = renderNotification({
      kind: "date_confirmed",
      facts: { planTitle: "Jantar no Centro", dateLabel: "sábado, 3 de outubro" },
      previewMode: "full",
      seed: "intent-1",
    });
    expect(cheia.body).toContain("Jantar no Centro");
    expect(cheia.body).toContain("sábado, 3 de outubro");
  });

  it("a variante é determinística por intent", () => {
    const render = () =>
      renderNotification({
        kind: "plan_created",
        facts: { actorName: "Nina", planTitle: "Feira" },
        previewMode: "full",
        seed: "mesma-intent",
      });
    expect(render()).toEqual(render());
    expect(variantIndex("mesma-intent", 3)).toBe(
      variantIndex("mesma-intent", 3),
    );
  });

  it("seeds diferentes distribuem entre as variantes", () => {
    const vistos = new Set(
      Array.from({ length: 60 }, (_, i) => variantIndex(`intent-${i}`, 3)),
    );
    expect(vistos.size).toBe(3);
  });

  it("uma data e várias datas não dizem a mesma coisa", () => {
    const uma = renderNotification({
      kind: "date_suggested",
      facts: { actorName: "Alex", planTitle: "Feira", optionCount: 1 },
      previewMode: "full",
      seed: "s",
    });
    const varias = renderNotification({
      kind: "date_suggested",
      facts: { actorName: "Alex", planTitle: "Feira", optionCount: 4 },
      previewMode: "full",
      seed: "s",
    });
    expect(uma.body).toContain("uma data");
    expect(varias.body).toContain("4 datas");
  });

  it("arquivar não é excluir", () => {
    const copy = renderNotification({
      kind: "plan_archived",
      facts: { actorName: "Nina", planTitle: "Feira" },
      previewMode: "full",
      seed: "s",
    });
    expect(copy.body).toContain("arquivou");
    expect(copy.body.toLowerCase()).not.toContain("exclu");
  });

  it("todo kind tem copy nos dois modos", () => {
    for (const kind of NOTIFICATION_KINDS) {
      for (const previewMode of ["private", "full"] as const) {
        const copy = renderNotification({
          kind,
          facts: { actorName: "Alex", planTitle: "Plano", offsetDays: 1 },
          previewMode,
          seed: "s",
        });
        expect(copy.title.length, `${kind}/${previewMode}`).toBeGreaterThan(0);
        expect(copy.body.length, `${kind}/${previewMode}`).toBeGreaterThan(0);
      }
    }
  });
});

describe("deep link", () => {
  it("todo kind com plano aponta para o plano", () => {
    for (const kind of NOTIFICATION_KINDS) {
      expect(deepLinkFor({ kind, planId: "abc" })).toBe("/planos/abc");
    }
  });

  it("sem plano, lembrete vai para a agenda e o resto para a home", () => {
    expect(deepLinkFor({ kind: "date_reminder", planId: null })).toBe("/agenda");
    expect(deepLinkFor({ kind: "plan_created", planId: null })).toBe("/");
  });

  it("recusa qualquer coisa que não seja caminho interno", () => {
    expect(isSafeInternalPath("/planos/abc")).toBe(true);
    /* `//evil.com` é caminho relativo de protocolo: o navegador o resolve como
       origem externa. É o furo que a validação existe para fechar. */
    expect(isSafeInternalPath("//evil.com")).toBe(false);
    expect(isSafeInternalPath("https://evil.com")).toBe(false);
    expect(isSafeInternalPath("javascript:alert(1)")).toBe(false);
    expect(isSafeInternalPath("planos/abc")).toBe(false);
  });
});

describe("classificação da resposta do push service", () => {
  it("2xx envia", () => {
    expect(classifyPushStatus(201)).toEqual({ status: "sent", statusCode: 201 });
  });

  it("404 e 410 desativam a subscription", () => {
    expect(classifyPushStatus(404).status).toBe("stale");
    expect(classifyPushStatus(410).status).toBe("stale");
  });

  it("429 e 5xx são temporários e não encostam na subscription", () => {
    /* Confundir 429 com 410 apaga o cadastro de quem só estava sendo limitado,
       e a pessoa para de receber para sempre sem ninguém perceber. */
    expect(classifyPushStatus(429)).toMatchObject({
      status: "failed",
      errorCode: "rate_limited",
    });
    expect(classifyPushStatus(503).status).toBe("failed");
  });
});
