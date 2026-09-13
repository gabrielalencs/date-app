import { describe, expect, it } from "vitest";

import {
  isAllowedEmail,
  originAllowsSessionCookie,
  parseAllowedEmails,
  parseAuthConfig,
} from "@/lib/auth/config";

const SECRET = "x".repeat(32);
const BASE = { NEON_AUTH_BASE_URL: "https://auth.example.invalid" };

describe("parseAllowedEmails", () => {
  it("aceita exatamente dois e-mails", () => {
    expect(parseAllowedEmails("a@example.com,b@example.com")).toEqual([
      "a@example.com",
      "b@example.com",
    ]);
  });

  it("faz trim e lowercase", () => {
    expect(parseAllowedEmails("  A@Example.COM , B@Example.com ")).toEqual([
      "a@example.com",
      "b@example.com",
    ]);
  });

  it("recusa um único e-mail", () => {
    expect(() => parseAllowedEmails("a@example.com")).toThrow(
      /exatamente dois/,
    );
  });

  it("recusa três e-mails", () => {
    expect(() =>
      parseAllowedEmails("a@example.com,b@example.com,c@example.com"),
    ).toThrow(/exatamente dois/);
  });

  it("recusa duplicados, inclusive com caixa diferente", () => {
    expect(() => parseAllowedEmails("a@example.com,A@EXAMPLE.COM")).toThrow(
      /duplicados/,
    );
  });

  it("recusa e-mail inválido", () => {
    expect(() => parseAllowedEmails("a@example.com,nao-e-email")).toThrow(
      /inválido/,
    );
  });

  it("recusa ausência da variável", () => {
    expect(() => parseAllowedEmails(undefined)).toThrow(/exatamente dois/);
    expect(() => parseAllowedEmails("")).toThrow(/exatamente dois/);
  });
});

describe("parseAuthConfig", () => {
  const valid = {
    ...BASE,
    NEON_AUTH_COOKIE_SECRET: SECRET,
    ALLOWED_EMAILS: "a@example.com,b@example.com",
    DATE_OWNER_EMAIL: "a@example.com",
  };

  it("aceita configuração completa e normaliza o owner", () => {
    const config = parseAuthConfig({
      ...valid,
      DATE_OWNER_EMAIL: "  A@Example.com ",
    });

    expect(config.ownerEmail).toBe("a@example.com");
    expect(config.allowedEmails).toEqual(["a@example.com", "b@example.com"]);
  });

  it("recusa owner fora da allowlist", () => {
    expect(() =>
      parseAuthConfig({ ...valid, DATE_OWNER_EMAIL: "c@example.com" }),
    ).toThrow(/precisa pertencer/);
  });

  it("recusa cookie secret com menos de 32 caracteres", () => {
    expect(() =>
      parseAuthConfig({ ...valid, NEON_AUTH_COOKIE_SECRET: "curto" }),
    ).toThrow(/32 caracteres/);
  });

  it("recusa base url ausente ou não-HTTPS fora de localhost", () => {
    expect(() =>
      parseAuthConfig({ ...valid, NEON_AUTH_BASE_URL: undefined }),
    ).toThrow(/URL válida/);
    expect(() =>
      parseAuthConfig({
        ...valid,
        NEON_AUTH_BASE_URL: "http://auth.example.invalid",
      }),
    ).toThrow(/HTTPS/);
  });

  it("não expõe o segredo em mensagem de erro", () => {
    try {
      parseAuthConfig({ ...valid, DATE_OWNER_EMAIL: "c@example.com" });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).not.toContain(SECRET);
    }
  });
});

describe("isAllowedEmail", () => {
  const allowed = ["a@example.com", "b@example.com"];

  it("compara depois de normalizar", () => {
    expect(isAllowedEmail("  A@Example.COM ", allowed)).toBe(true);
    expect(isAllowedEmail("c@example.com", allowed)).toBe(false);
  });
});

/**
 * A origem decide se a sessão sobrevive.
 *
 * O `@neondatabase/auth` fixa `secure: true` e o prefixo `__Secure-`, então o
 * navegador descarta o cookie fora de uma origem confiável — e o sintoma é uma
 * tela de login que aceita a senha e devolve para o login na navegação
 * seguinte, sem erro nenhum. Medido: em `http://127.0.0.1:3000` o login nem
 * chega a criar cookie; em `http://localhost:3000` tudo passa.
 */
describe("originAllowsSessionCookie", () => {
  it.each([
    "https://date.app",
    "https://localhost:3000",
    "http://localhost:3000",
    "http://localhost",
    "http://app.localhost:3000",
    "http://127.0.0.1:3000",
    "http://127.10.20.30:3000",
    "http://[::1]:3000",
  ])("aceita %s", (origin) => {
    expect(originAllowsSessionCookie(origin)).toBe(true);
  });

  it.each([
    // O que o Next imprime como "Network" e é a armadilha real.
    "http://192.168.0.14:3000",
    "http://10.0.0.5:3000",
    "http://172.16.3.1:3000",
    "http://meu-pc.local:3000",
    "http://date.app",
    "ftp://localhost",
    "não é uma url",
    "",
  ])("recusa %s", (origin) => {
    expect(originAllowsSessionCookie(origin)).toBe(false);
  });

  it("não confunde 127 no meio do endereço com loopback", () => {
    expect(originAllowsSessionCookie("http://10.0.0.127:3000")).toBe(false);
    expect(originAllowsSessionCookie("http://127.0.0.1.example.com")).toBe(
      false,
    );
  });
});
