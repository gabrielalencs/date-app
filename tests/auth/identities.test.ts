import { describe, expect, it } from "vitest";

import { assertCoversAllowlist, parseIdentities } from "@/db/identities";

/**
 * A gramática de `DATE_*_AUTH_USERS`.
 *
 * O caso que motivou o arquivo é o último: colar a linha inteira que o
 * `auth:create-prod-users` imprime. Antes da validação isso gravava
 * `DATE_PROD_AUTH_USERS=<uuid>` em `profiles.id`, o comando terminava com
 * "memberships no workspace: 2" e o defeito só aparecia no primeiro login do
 * dono, como 403.
 */
const VAR = "DATE_PROD_AUTH_USERS";
const A = "b4eb5fe5-bbbe-4274-a1e9-61f4e9785cb9";
const B = "cbcee3b3-5370-4ddb-82f8-571b1c38e85e";

describe("parseIdentities", () => {
  it("lê os dois pares e normaliza o e-mail", () => {
    expect(
      parseIdentities(`${A}:UM@Date.Test , ${B}:dois@date.test`, VAR),
    ).toEqual([
      { id: A, email: "um@date.test" },
      { id: B, email: "dois@date.test" },
    ]);
  });

  it("devolve vazio quando a variável não existe", () => {
    expect(parseIdentities(undefined, VAR)).toEqual([]);
  });

  it("recusa entrada sem os dois pontos", () => {
    expect(() => parseIdentities(`${A}-um@date.test`, VAR)).toThrow(
      /pares id:email/,
    );
  });

  it("recusa a linha inteira colada dentro do valor, dizendo o que houve", () => {
    const erro = (() => {
      try {
        parseIdentities(`${VAR}=${A}:um@date.test,${B}:dois@date.test`, VAR);
        return null;
      } catch (e) {
        return e as Error;
      }
    })();

    expect(erro?.message).toContain("A linha inteira foi colada");
  });

  it("recusa id com espaço, arroba ou sinal de igual", () => {
    for (const id of ["a b", "x=1", "pessoa@date.test", ""]) {
      expect(() => parseIdentities(`${id}:um@date.test`, VAR), id).toThrow(
        /ABORTADO/,
      );
    }
  });
});

describe("assertCoversAllowlist", () => {
  const allow = ["um@date.test", "dois@date.test"] as const;

  it("aceita quando as duas identidades cobrem a allowlist", () => {
    expect(() =>
      assertCoversAllowlist(
        [
          { id: A, email: "um@date.test" },
          { id: B, email: "dois@date.test" },
        ],
        allow,
        VAR,
      ),
    ).not.toThrow();
  });

  it("recusa quando não são exatamente duas", () => {
    expect(() =>
      assertCoversAllowlist([{ id: A, email: "um@date.test" }], allow, VAR),
    ).toThrow(/exatamente duas/);
  });

  it("recusa quando falta um e-mail da allowlist", () => {
    expect(() =>
      assertCoversAllowlist(
        [
          { id: A, email: "um@date.test" },
          { id: B, email: "outro@date.test" },
        ],
        allow,
        VAR,
      ),
    ).toThrow(/não cobrem ALLOWED_EMAILS/);
  });
});
