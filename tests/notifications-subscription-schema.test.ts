import { describe, expect, it } from "vitest";

import { pushSubscriptionSchema } from "@/features/notifications/subscription-schema";

/**
 * O boundary da subscription contra a forma que o navegador **de verdade**
 * entrega (D-180).
 *
 * Toda a suíte anterior montava o corpo à mão — `{ endpoint, keys }` — e por
 * isso passava. O `toJSON()` real traz `expirationTime`, o schema estrito o
 * recusava, e em produção nenhum aparelho chegou a ser gravado. Estes casos
 * copiam o formato do Chrome e do Safari, não o que o teste acha que ele é.
 */

/* Valores de fixture, não credenciais: o schema só confere forma e tamanho. */
const CHAVES = {
  p256dh: "fixture-p256dh-chave-publica-do-navegador",
  auth: "fixture-auth",
};

/** O que `PushSubscription.toJSON()` devolve no Chrome do Android. */
const CHROME = {
  endpoint: "https://fcm.googleapis.com/fcm/send/fixture-endpoint",
  expirationTime: null,
  keys: CHAVES,
};

/** O mesmo no Safari do iPhone, com a web app instalada. */
const SAFARI = {
  endpoint: "https://web.push.apple.com/fixture-endpoint",
  expirationTime: null,
  keys: CHAVES,
};

describe("pushSubscriptionSchema", () => {
  it("aceita o toJSON() do Chrome, com expirationTime nulo", () => {
    expect(pushSubscriptionSchema.safeParse(CHROME).success).toBe(true);
  });

  it("aceita o toJSON() do Safari instalado", () => {
    expect(pushSubscriptionSchema.safeParse(SAFARI).success).toBe(true);
  });

  it("aceita expirationTime numérico, que a especificação permite", () => {
    const resultado = pushSubscriptionSchema.safeParse({
      ...CHROME,
      expirationTime: 1_790_000_000_000,
    });
    expect(resultado.success).toBe(true);
  });

  it("aceita o corpo sem expirationTime", () => {
    const semExpiracao = { endpoint: CHROME.endpoint, keys: CHROME.keys };
    expect(pushSubscriptionSchema.safeParse(semExpiracao).success).toBe(true);
  });

  it("recusa um corpo que tenta dizer de quem é a subscription", () => {
    for (const campo of ["profileId", "workspaceId"]) {
      const resultado = pushSubscriptionSchema.safeParse({
        ...CHROME,
        [campo]: "forjado",
      });
      expect(resultado.success, campo).toBe(false);
    }
  });

  it("recusa chave extra dentro de keys", () => {
    const resultado = pushSubscriptionSchema.safeParse({
      ...CHROME,
      keys: { ...CHAVES, extra: "x" },
    });
    expect(resultado.success).toBe(false);
  });

  it("recusa endpoint que não é URL e chave vazia", () => {
    expect(
      pushSubscriptionSchema.safeParse({ ...CHROME, endpoint: "nao-e-url" })
        .success,
    ).toBe(false);
    expect(
      pushSubscriptionSchema.safeParse({
        ...CHROME,
        keys: { ...CHAVES, auth: "" },
      }).success,
    ).toBe(false);
  });
});
