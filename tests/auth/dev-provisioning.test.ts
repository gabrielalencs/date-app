import { describe, expect, it } from "vitest";

import {
  credentialsMatchAllowlist,
  parseDevCredentials,
  signUpUrl,
} from "@/lib/auth/dev-provisioning";

const HOST = "https://ep-exemplo.neonauth.sa-east-1.aws.neon.tech";

describe("signUpUrl", () => {
  it("preserva o segmento /auth da base", () => {
    expect(signUpUrl(`${HOST}/auth`)).toBe(`${HOST}/auth/sign-up/email`);
  });

  it("não duplica a barra quando a base já termina em /", () => {
    expect(signUpUrl(`${HOST}/auth/`)).toBe(`${HOST}/auth/sign-up/email`);
  });

  it("funciona com base na raiz do host", () => {
    expect(signUpUrl(HOST)).toBe(`${HOST}/sign-up/email`);
  });

  it("não repete a armadilha do URL relativo", () => {
    // Sem normalizar a barra, new URL() descartaria o /auth.
    const ingenuo = new URL("sign-up/email", `${HOST}/auth`).toString();
    expect(ingenuo).toBe(`${HOST}/sign-up/email`);
    expect(signUpUrl(`${HOST}/auth`)).not.toBe(ingenuo);
  });
});

describe("parseDevCredentials", () => {
  const valid = "a@example.com:senha-longa,b@example.com:outra-senha";

  it("separa os dois pares e normaliza o e-mail", () => {
    expect(
      parseDevCredentials(
        " A@Example.COM:senha-longa , b@example.com:outra-senha ",
      ),
    ).toEqual([
      { email: "a@example.com", password: "senha-longa" },
      { email: "b@example.com", password: "outra-senha" },
    ]);
  });

  it("preserva dois pontos dentro da senha", () => {
    const [first] = parseDevCredentials(
      "a@example.com:se:nha:longa,b@example.com:outra-senha",
    );
    expect(first?.password).toBe("se:nha:longa");
  });

  it("recusa quantidade diferente de dois", () => {
    expect(() => parseDevCredentials("a@example.com:senha-longa")).toThrow(
      /exatamente dois/,
    );
    expect(() => parseDevCredentials(undefined)).toThrow(/não está definida/);
  });

  it("recusa senha curta sem revelar a senha", () => {
    try {
      parseDevCredentials("a@example.com:curta,b@example.com:outra-senha");
      expect.unreachable();
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toMatch(/menos de 8/);
      expect(message).not.toContain("curta");
    }
  });

  it("recusa entrada sem dois pontos", () => {
    expect(() =>
      parseDevCredentials("a@example.com,b@example.com:outra-senha"),
    ).toThrow(/email:senha/);
  });

  it("mensagem de erro nunca contém a senha", () => {
    for (const raw of [
      "a@example.com:senha-longa",
      ":senha-longa,b@e.com:outra-senha",
    ]) {
      try {
        parseDevCredentials(raw);
      } catch (error) {
        expect((error as Error).message).not.toContain("senha-longa");
      }
    }
    expect(parseDevCredentials(valid)).toHaveLength(2);
  });
});

describe("credentialsMatchAllowlist", () => {
  const credentials = [
    { email: "a@example.com", password: "senha-longa" },
    { email: "b@example.com", password: "outra-senha" },
  ];

  it("aceita o mesmo par, em qualquer ordem", () => {
    expect(
      credentialsMatchAllowlist(credentials, [
        "b@example.com",
        "a@example.com",
      ]),
    ).toBe(true);
  });

  it("recusa e-mail fora da allowlist", () => {
    expect(
      credentialsMatchAllowlist(credentials, [
        "a@example.com",
        "c@example.com",
      ]),
    ).toBe(false);
  });
});
