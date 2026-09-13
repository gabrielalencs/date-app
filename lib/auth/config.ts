import { z } from "zod";

const emailSchema = z.email();

/**
 * Validade do dado de sessão guardado no cookie, em segundos.
 *
 * Mora aqui porque **duas** instâncias do Neon Auth precisam do mesmo valor: a
 * do `proxy.ts`, que decide navegação, e a do `lib/auth/server.ts`, que resolve
 * o contexto autorizado. O pacote lê `sessionDataTtl` nas duas.
 *
 * Com valores diferentes, elas discordam sobre quando o dado venceu — e o
 * sintoma é um ricochete para /login sem erro nenhum na tela, que é o tipo de
 * defeito que se procura no lugar errado por horas.
 */
export const SESSION_DATA_TTL_SECONDS = 300;

/**
 * Origem em que o cookie de sessão sobrevive.
 *
 * O `@neondatabase/auth` fixa `secure: true` e o prefixo `__Secure-`, sem opção
 * de desligar — é a decisão certa dele, e significa que o navegador **descarta
 * o cookie em silêncio** fora de uma origem que ele considere confiável.
 *
 * Confiável é HTTPS, `localhost`, `*.localhost` e a faixa de loopback. Abrir o
 * app em desenvolvimento pelo IP da rede (`http://192.168.x.x:3000`, que é o
 * que o Next imprime como "Network") entrega uma tela de login que aceita a
 * senha e devolve para o login na navegação seguinte, sem erro nenhum — e o
 * sintoma fica indistinguível de sessão quebrada.
 */
export function originAllowsSessionCookie(origin: string): boolean {
  let url: URL;

  try {
    url = new URL(origin);
  } catch {
    return false;
  }

  if (url.protocol === "https:") return true;
  if (url.protocol !== "http:") return false;

  const host = url.hostname;

  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "[::1]" ||
    host === "::1" ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)
  );
}

export type AuthConfig = {
  baseUrl: string;
  cookieSecret: string;
  allowedEmails: readonly [string, string];
  ownerEmail: string;
};

export type AuthEnvInput = {
  NEON_AUTH_BASE_URL?: string;
  NEON_AUTH_COOKIE_SECRET?: string;
  ALLOWED_EMAILS?: string;
  DATE_OWNER_EMAIL?: string;
};

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function parseAllowedEmails(
  value: string | undefined,
): readonly [string, string] {
  if (!value) {
    throw new Error("ALLOWED_EMAILS deve conter exatamente dois e-mails.");
  }

  const entries = value.split(",").map(normalizeEmail);
  if (entries.length !== 2 || entries.some((entry) => entry.length === 0)) {
    throw new Error("ALLOWED_EMAILS deve conter exatamente dois e-mails.");
  }

  const parsed = entries.map((entry) => emailSchema.safeParse(entry));
  if (parsed.some((result) => !result.success)) {
    throw new Error("ALLOWED_EMAILS contém um e-mail inválido.");
  }

  const unique = [...new Set(entries)];
  if (unique.length !== 2) {
    throw new Error("ALLOWED_EMAILS não aceita e-mails duplicados.");
  }

  return [unique[0]!, unique[1]!];
}

function parseBaseUrl(value: string | undefined): string {
  const result = z.url().safeParse(value);
  if (!result.success) {
    throw new Error("NEON_AUTH_BASE_URL deve ser uma URL válida.");
  }

  const url = new URL(result.data);
  if (
    url.protocol !== "https:" &&
    url.hostname !== "localhost" &&
    url.hostname !== "127.0.0.1"
  ) {
    throw new Error("NEON_AUTH_BASE_URL deve usar HTTPS fora de localhost.");
  }

  return url.toString().replace(/\/$/, "");
}

export function parseAuthConfig(input: AuthEnvInput): AuthConfig {
  const allowedEmails = parseAllowedEmails(input.ALLOWED_EMAILS);
  const ownerCandidate = normalizeEmail(input.DATE_OWNER_EMAIL ?? "");
  const owner = emailSchema.safeParse(ownerCandidate);

  if (!owner.success) {
    throw new Error("DATE_OWNER_EMAIL deve ser um e-mail válido.");
  }
  if (!allowedEmails.includes(owner.data)) {
    throw new Error("DATE_OWNER_EMAIL precisa pertencer a ALLOWED_EMAILS.");
  }

  const secret = z.string().min(32).safeParse(input.NEON_AUTH_COOKIE_SECRET);
  if (!secret.success) {
    throw new Error("NEON_AUTH_COOKIE_SECRET deve ter ao menos 32 caracteres.");
  }

  return {
    baseUrl: parseBaseUrl(input.NEON_AUTH_BASE_URL),
    cookieSecret: secret.data,
    allowedEmails,
    ownerEmail: owner.data,
  };
}

export function isAllowedEmail(
  email: string,
  allowedEmails: readonly string[],
): boolean {
  return allowedEmails.includes(normalizeEmail(email));
}

export function normalizedEmail(email: string): string {
  return normalizeEmail(email);
}
