import { describe, expect, it } from "vitest";

import { isAllowedAuthOperation } from "@/lib/auth/http-policy";

/**
 * A lista abaixo saiu de API_ENDPOINTS do @neondatabase/auth instalado: é o que
 * o handler genérico encaminharia se a rota reexportasse `auth.handler()`.
 */
const BLOCKED: readonly [string, string[]][] = [
  ["POST", ["sign-up", "email"]],
  ["POST", ["sign-in", "social"]],
  ["POST", ["sign-in", "magic-link"]],
  ["POST", ["sign-in", "email-otp"]],
  ["POST", ["delete-user"]],
  ["POST", ["update-user"]],
  ["POST", ["change-password"]],
  ["POST", ["reset-password"]],
  ["POST", ["admin", "create-user"]],
  ["GET", ["admin", "list-users"]],
  ["POST", ["admin", "set-role"]],
  ["POST", ["admin", "set-user-password"]],
  ["POST", ["admin", "impersonate-user"]],
  ["POST", ["admin", "ban-user"]],
  ["GET", ["jwt"]],
  ["GET", ["token"]],
];

describe("allowlist positiva da rota de auth", () => {
  it("permite apenas sessão, login por e-mail e logout", () => {
    expect(isAllowedAuthOperation("GET", ["get-session"])).toBe(true);
    expect(isAllowedAuthOperation("POST", ["sign-in", "email"])).toBe(true);
    expect(isAllowedAuthOperation("POST", ["sign-out"])).toBe(true);
  });

  it.each(BLOCKED)("bloqueia %s /%s", (method, path) => {
    expect(isAllowedAuthOperation(method, path)).toBe(false);
  });

  it("não deixa o método trocar a operação permitida", () => {
    expect(isAllowedAuthOperation("POST", ["get-session"])).toBe(false);
    expect(isAllowedAuthOperation("GET", ["sign-in", "email"])).toBe(false);
    expect(isAllowedAuthOperation("GET", ["sign-out"])).toBe(false);
  });

  it("é insensível à caixa do método, mas não à do caminho", () => {
    expect(isAllowedAuthOperation("post", ["sign-in", "email"])).toBe(true);
    expect(isAllowedAuthOperation("POST", ["Sign-In", "Email"])).toBe(false);
  });

  it("ignora caminho vazio", () => {
    expect(isAllowedAuthOperation("GET", [])).toBe(false);
  });
});
