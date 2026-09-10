import { z } from "zod";

const emailSchema = z.email();

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

export function parseAllowedEmails(value: string | undefined): readonly [string, string] {
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
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
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

export function isAllowedEmail(email: string, allowedEmails: readonly string[]): boolean {
  return allowedEmails.includes(normalizeEmail(email));
}

export function normalizedEmail(email: string): string {
  return normalizeEmail(email);
}
