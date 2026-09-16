/**
 * Verificação e política do webhook do Neon Auth (D-043).
 *
 * Lógica pura: sem rede, sem env, sem banco. Quem busca o JWKS e quem lê
 * `process.env` é a rota; aqui fica o que erra silencioso e por isso precisa de
 * teste — a reconstrução do signing input e a decisão da allowlist.
 *
 * O provedor assina cada entrega com EdDSA (Ed25519) num **JWS destacado**, não
 * com segredo compartilhado: a chave pública vive em
 * `<NEON_AUTH_BASE_URL>/.well-known/jwks.json` e é escolhida pelo `kid` do
 * header. Rotação de chave do lado do Neon não exige reconfigurar nada aqui.
 */
import {
  createPublicKey,
  verify as verifyEd25519,
  type JsonWebKey as CryptoJsonWebKey,
} from "node:crypto";

import { normalizedEmail } from "./config.ts";

/** Nome do evento bloqueante que o DATE usa. É o único que ele trata. */
export const BEFORE_CREATE = "user.before_create";

/**
 * Idade máxima aceita para uma entrega, em milissegundos.
 *
 * O provedor tenta no máximo três vezes, sem espera entre elas, com um teto
 * global de 15 s. Cinco minutos é folga larga para relógio dessincronizado sem
 * abrir janela útil para replay de uma entrega capturada.
 */
export const MAX_AGE_MS = 5 * 60 * 1000;

export type WebhookHeaders = {
  readonly signature: string;
  readonly kid: string;
  /** Unix em MILISSEGUNDOS. O provedor manda ms, não s. */
  readonly timestamp: string;
  readonly eventType: string;
  readonly eventId: string;
};

/**
 * Uma chave do JWKS. O `kid` aparece nomeado porque é o campo pelo qual a
 * entrega escolhe a chave; o resto fica aberto porque quem define a forma é o
 * provedor, e o `createPublicKey` valida o conteúdo melhor que um tipo nosso.
 */
export type Jwk = { readonly kid?: string } & Record<string, unknown>;
export type Jwks = { readonly keys?: readonly Jwk[] };

export type VerifyFailure =
  | "timestamp_invalido"
  | "entrega_vencida"
  | "kid_desconhecido"
  | "jws_malformado"
  | "assinatura_invalida";

export type VerifyResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: VerifyFailure };

export function readWebhookHeaders(headers: Headers): WebhookHeaders | null {
  const signature = headers.get("x-neon-signature");
  const kid = headers.get("x-neon-signature-kid");
  const timestamp = headers.get("x-neon-timestamp");
  const eventType = headers.get("x-neon-event-type");
  const eventId = headers.get("x-neon-event-id");

  if (!signature || !kid || !timestamp || !eventType || !eventId) {
    return null;
  }

  return { signature, kid, timestamp, eventType, eventId };
}

/**
 * O detalhe em que toda implementação ingênua falha: o payload assinado é
 * base64url **duas vezes**.
 *
 *   payloadB64          = base64url(corpo cru)
 *   signaturePayload    = `${timestamp}.${payloadB64}`
 *   signaturePayloadB64 = base64url(signaturePayload)
 *   signingInput        = `${headerB64}.${signaturePayloadB64}`
 *
 * Reconstruir `${timestamp}.${corpo}` — que é o que a intuição manda — produz
 * assinatura sempre inválida, e o sintoma é indistinguível de chave errada.
 */
export function buildSigningInput(
  headerB64: string,
  timestamp: string,
  rawBody: string,
): string {
  const payloadB64 = Buffer.from(rawBody, "utf8").toString("base64url");
  const signaturePayload = `${timestamp}.${payloadB64}`;
  const signaturePayloadB64 = Buffer.from(signaturePayload, "utf8").toString(
    "base64url",
  );

  return `${headerB64}.${signaturePayloadB64}`;
}

function findKey(jwks: Jwks, kid: string): Jwk | undefined {
  return jwks.keys?.find((key) => key.kid === kid);
}

/**
 * Verifica a assinatura destacada contra o JWKS recebido como dado.
 *
 * O JWKS entra por parâmetro, e não por fetch aqui dentro, para o caminho todo
 * ser testável com um par de chaves gerado no próprio teste.
 */
export function verifyWebhookSignature(input: {
  readonly rawBody: string;
  readonly headers: WebhookHeaders;
  readonly jwks: Jwks;
  readonly now: number;
  readonly maxAgeMs?: number;
}): VerifyResult {
  const { rawBody, headers, jwks, now } = input;
  const maxAgeMs = input.maxAgeMs ?? MAX_AGE_MS;

  const sentAt = Number.parseInt(headers.timestamp, 10);
  if (!Number.isFinite(sentAt)) {
    return { ok: false, reason: "timestamp_invalido" };
  }

  /* Vale nos dois sentidos: entrega velha é replay, entrega do futuro é
     relógio quebrado de um dos lados. Nenhuma das duas assina decisão. */
  if (Math.abs(now - sentAt) > maxAgeMs) {
    return { ok: false, reason: "entrega_vencida" };
  }

  const parts = headers.signature.split(".");
  if (parts.length !== 3 || parts[1] !== "" || !parts[0] || !parts[2]) {
    return { ok: false, reason: "jws_malformado" };
  }

  const [headerB64, , signatureB64] = parts as [string, string, string];

  const jwk = findKey(jwks, headers.kid);
  if (!jwk) {
    return { ok: false, reason: "kid_desconhecido" };
  }

  try {
    /* O cast é o boundary com o `node:crypto`. Duas armadilhas de tipo num
       lugar só: existem dois `JsonWebKey` no projeto — o do DOM e o do módulo
       crypto — e só o segundo serve aqui; e ele tem index signature, que o
       nosso `Jwk` não tem por nomear `kid`. Quem valida o conteúdo de verdade
       é o próprio `createPublicKey`, que estoura com chave inutilizável — e o
       catch abaixo transforma isso em recusa, nunca em passagem. */
    const publicKey = createPublicKey({
      key: jwk as CryptoJsonWebKey,
      format: "jwk",
    });

    const signingInput = buildSigningInput(
      headerB64,
      headers.timestamp,
      rawBody,
    );

    const valid = verifyEd25519(
      null,
      Buffer.from(signingInput, "utf8"),
      publicKey,
      Buffer.from(signatureB64, "base64url"),
    );

    return valid ? { ok: true } : { ok: false, reason: "assinatura_invalida" };
  } catch {
    /* Chave malformada no JWKS, curva errada, base64url inválido: tudo isso é
       assinatura que não confere. Nunca deixa passar por exceção. */
    return { ok: false, reason: "assinatura_invalida" };
  }
}

/**
 * A decisão devolve o e-mail junto quando libera, para a rota conseguir
 * registrar a liberação sem parsear o corpo de novo.
 */
export type BeforeCreateDecision =
  | { readonly allowed: true; readonly email: string }
  | { readonly allowed: false };

/**
 * A decisão. Fecha por padrão: corpo ilegível, envelope sem `user.email` ou
 * e-mail fora da allowlist terminam todos em recusa.
 *
 * Não usa Zod de propósito. O boundary aqui não tem forma de negócio a validar
 * — é uma pergunta de uma linha sobre um campo — e uma exceção de parsing num
 * caminho que precisa negar sem estourar seria caminho a mais para errar.
 */
export function decideUserBeforeCreate(
  rawBody: string,
  allowedEmails: readonly string[],
): BeforeCreateDecision {
  let payload: unknown;

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { allowed: false };
  }

  if (typeof payload !== "object" || payload === null) {
    return { allowed: false };
  }

  const user = (payload as { user?: unknown }).user;
  if (typeof user !== "object" || user === null) {
    return { allowed: false };
  }

  const email = (user as { email?: unknown }).email;
  if (typeof email !== "string" || email.trim().length === 0) {
    return { allowed: false };
  }

  const normalized = normalizedEmail(email);
  const permitido = allowedEmails.some(
    (allowed) => normalizedEmail(allowed) === normalized,
  );

  return permitido ? { allowed: true, email: normalized } : { allowed: false };
}

/**
 * Mascara para log. O webhook é a única superfície do DATE que vê um e-mail que
 * não é dos dois — inclusive de quem está tentando entrar. Log de tentativa é
 * útil; log do endereço de terceiro não é nosso para guardar.
 */
export function maskEmailForLog(email: string): string {
  const [user = "", domain = ""] = email.split("@");
  const head = user.slice(0, 1);
  return `${head}${"*".repeat(Math.max(user.length - 1, 1))}@${domain}`;
}
