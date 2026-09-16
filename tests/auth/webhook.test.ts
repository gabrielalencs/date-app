import {
  createSign,
  generateKeyPairSync,
  sign as signEd25519,
} from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  BEFORE_CREATE,
  buildSigningInput,
  decideUserBeforeCreate,
  maskEmailForLog,
  readWebhookHeaders,
  verifyWebhookSignature,
  type Jwks,
  type WebhookHeaders,
} from "@/lib/auth/webhook";

/**
 * O par de chaves é gerado aqui, no teste. Assim o caminho inteiro da
 * verificação — reconstrução do signing input, seleção por `kid`, Ed25519 — é
 * exercitado contra uma assinatura de verdade, sem depender de rede nem de
 * fixture copiada de documentação.
 */
const KID = "01dec52b-4666-40f7-87ed-6423552eecaf";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");

const jwks: Jwks = {
  keys: [{ ...publicKey.export({ format: "jwk" }), kid: KID }],
};

const JWS_HEADER = Buffer.from(
  JSON.stringify({ alg: "EdDSA", typ: "JWS", kid: KID }),
).toString("base64url");

const ALLOWED = ["pessoa@date.test", "outra@date.test"] as const;

function corpo(email: string, eventType = BEFORE_CREATE): string {
  return JSON.stringify({
    event_id: "550e8400-e29b-41d4-a716-446655440000",
    event_type: eventType,
    timestamp: "2026-09-16T12:00:00.000Z",
    user: { id: "abc", email, name: "Alguém", email_verified: false },
    event_data: { auth_provider: "credential" },
  });
}

/** Assina como o provedor assina: JWS destacado sobre o duplo base64url. */
function assinar(rawBody: string, timestamp: string): string {
  const input = buildSigningInput(JWS_HEADER, timestamp, rawBody);
  const signature = signEd25519(null, Buffer.from(input, "utf8"), privateKey);
  return `${JWS_HEADER}..${signature.toString("base64url")}`;
}

function entrega(
  rawBody: string,
  now: number,
  overrides: Partial<WebhookHeaders> = {},
): WebhookHeaders {
  const timestamp = String(now);
  return {
    signature: assinar(rawBody, timestamp),
    kid: KID,
    timestamp,
    eventType: BEFORE_CREATE,
    eventId: "550e8400-e29b-41d4-a716-446655440000",
    ...overrides,
  };
}

describe("readWebhookHeaders", () => {
  it("lê os cinco headers da entrega", () => {
    const headers = new Headers({
      "x-neon-signature": "a..b",
      "x-neon-signature-kid": KID,
      "x-neon-timestamp": "1740312000000",
      "x-neon-event-type": BEFORE_CREATE,
      "x-neon-event-id": "evt",
    });

    expect(readWebhookHeaders(headers)?.kid).toBe(KID);
  });

  it("devolve null quando falta qualquer um deles", () => {
    for (const ausente of [
      "x-neon-signature",
      "x-neon-signature-kid",
      "x-neon-timestamp",
      "x-neon-event-type",
      "x-neon-event-id",
    ]) {
      const headers = new Headers({
        "x-neon-signature": "a..b",
        "x-neon-signature-kid": KID,
        "x-neon-timestamp": "1740312000000",
        "x-neon-event-type": BEFORE_CREATE,
        "x-neon-event-id": "evt",
      });
      headers.delete(ausente);

      expect(readWebhookHeaders(headers), ausente).toBeNull();
    }
  });
});

describe("buildSigningInput", () => {
  /**
   * O teste que justifica a função existir. A reconstrução intuitiva —
   * `${timestamp}.${corpo}` — produz assinatura sempre inválida, e o sintoma
   * seria indistinguível de chave errada no JWKS.
   */
  it("aplica base64url duas vezes, não uma", () => {
    const rawBody = '{"a":1}';
    const timestamp = "1740312000000";

    const input = buildSigningInput(JWS_HEADER, timestamp, rawBody);
    const [, payloadB64] = input.split(".") as [string, string];

    const decodificadoUmaVez = Buffer.from(payloadB64, "base64url").toString();
    expect(decodificadoUmaVez).toBe(
      `${timestamp}.${Buffer.from(rawBody).toString("base64url")}`,
    );

    expect(decodificadoUmaVez).not.toBe(`${timestamp}.${rawBody}`);
  });
});

describe("verifyWebhookSignature", () => {
  const now = 1_774_000_000_000;

  it("aceita uma entrega assinada corretamente", () => {
    const rawBody = corpo(ALLOWED[0]);

    expect(
      verifyWebhookSignature({
        rawBody,
        headers: entrega(rawBody, now),
        jwks,
        now,
      }),
    ).toEqual({ ok: true });
  });

  it("recusa quando o corpo foi alterado depois da assinatura", () => {
    const rawBody = corpo(ALLOWED[0]);
    const headers = entrega(rawBody, now);

    const adulterado = corpo("invasor@example.invalid");

    expect(
      verifyWebhookSignature({ rawBody: adulterado, headers, jwks, now }),
    ).toEqual({ ok: false, reason: "assinatura_invalida" });
  });

  it("recusa quando o kid não está no JWKS", () => {
    const rawBody = corpo(ALLOWED[0]);

    expect(
      verifyWebhookSignature({
        rawBody,
        headers: entrega(rawBody, now, { kid: "outro-kid" }),
        jwks,
        now,
      }),
    ).toEqual({ ok: false, reason: "kid_desconhecido" });
  });

  it("recusa assinatura de outra chave com o mesmo kid", () => {
    const rawBody = corpo(ALLOWED[0]);
    const outro = generateKeyPairSync("ed25519");

    const input = buildSigningInput(JWS_HEADER, String(now), rawBody);
    const signature = signEd25519(
      null,
      Buffer.from(input, "utf8"),
      outro.privateKey,
    );

    expect(
      verifyWebhookSignature({
        rawBody,
        headers: entrega(rawBody, now, {
          signature: `${JWS_HEADER}..${signature.toString("base64url")}`,
        }),
        jwks,
        now,
      }),
    ).toEqual({ ok: false, reason: "assinatura_invalida" });
  });

  it("recusa entrega velha e entrega do futuro", () => {
    const rawBody = corpo(ALLOWED[0]);
    const seisMinutos = 6 * 60 * 1000;

    expect(
      verifyWebhookSignature({
        rawBody,
        headers: entrega(rawBody, now),
        jwks,
        now: now + seisMinutos,
      }),
    ).toEqual({ ok: false, reason: "entrega_vencida" });

    expect(
      verifyWebhookSignature({
        rawBody,
        headers: entrega(rawBody, now),
        jwks,
        now: now - seisMinutos,
      }),
    ).toEqual({ ok: false, reason: "entrega_vencida" });
  });

  it("recusa timestamp que não é número", () => {
    const rawBody = corpo(ALLOWED[0]);

    expect(
      verifyWebhookSignature({
        rawBody,
        headers: entrega(rawBody, now, { timestamp: "ontem" }),
        jwks,
        now,
      }),
    ).toEqual({ ok: false, reason: "timestamp_invalido" });
  });

  it("recusa JWS que não está no formato destacado", () => {
    const rawBody = corpo(ALLOWED[0]);
    const payload = Buffer.from(rawBody).toString("base64url");

    for (const malformado of [
      `${JWS_HEADER}.${payload}.assinatura`,
      `${JWS_HEADER}..`,
      "..",
      "sem-pontos",
    ]) {
      expect(
        verifyWebhookSignature({
          rawBody,
          headers: entrega(rawBody, now, { signature: malformado }),
          jwks,
          now,
        }),
        malformado,
      ).toEqual({ ok: false, reason: "jws_malformado" });
    }
  });

  it("recusa em vez de estourar quando o JWKS tem chave inutilizável", () => {
    const rawBody = corpo(ALLOWED[0]);

    const result = verifyWebhookSignature({
      rawBody,
      headers: entrega(rawBody, now),
      jwks: { keys: [{ kid: KID, kty: "OKP", crv: "Ed25519", x: "nada" }] },
      now,
    });

    expect(result).toEqual({ ok: false, reason: "assinatura_invalida" });
  });

  it("recusa assinatura de outro algoritmo", () => {
    const rawBody = corpo(ALLOWED[0]);
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });

    const input = buildSigningInput(JWS_HEADER, String(now), rawBody);
    const signer = createSign("sha256");
    signer.update(input);

    expect(
      verifyWebhookSignature({
        rawBody,
        headers: entrega(rawBody, now, {
          signature: `${JWS_HEADER}..${signer.sign(rsa.privateKey).toString("base64url")}`,
        }),
        jwks,
        now,
      }),
    ).toEqual({ ok: false, reason: "assinatura_invalida" });
  });
});

describe("decideUserBeforeCreate", () => {
  it("libera os dois e-mails da allowlist", () => {
    for (const email of ALLOWED) {
      expect(decideUserBeforeCreate(corpo(email), ALLOWED)).toEqual({
        allowed: true,
        email,
      });
    }
  });

  it("libera ignorando caixa e espaço em volta", () => {
    expect(
      decideUserBeforeCreate(corpo("  PESSOA@DATE.TEST  "), ALLOWED),
    ).toEqual({ allowed: true, email: ALLOWED[0] });
  });

  it("recusa qualquer terceiro", () => {
    for (const email of [
      "invasor@example.invalid",
      "pessoa@date.test.evil.com",
      "pessoa+extra@date.test",
      "",
    ]) {
      expect(decideUserBeforeCreate(corpo(email), ALLOWED), email).toEqual({
        allowed: false,
      });
    }
  });

  it("recusa corpo que não é JSON, não é objeto ou não tem user.email", () => {
    for (const rawBody of [
      "não é json",
      "null",
      '"texto"',
      "[]",
      "{}",
      '{"user":null}',
      '{"user":{}}',
      '{"user":{"email":42}}',
    ]) {
      expect(decideUserBeforeCreate(rawBody, ALLOWED), rawBody).toEqual({
        allowed: false,
      });
    }
  });

  it("recusa quando a allowlist chega vazia", () => {
    expect(decideUserBeforeCreate(corpo(ALLOWED[0]), [])).toEqual({
      allowed: false,
    });
  });
});

describe("maskEmailForLog", () => {
  it("mostra só a primeira letra antes da arroba", () => {
    expect(maskEmailForLog("pessoa@date.test")).toBe("p*****@date.test");
  });

  it("não vaza e-mail de uma letra", () => {
    expect(maskEmailForLog("a@date.test")).toBe("a*@date.test");
  });
});
