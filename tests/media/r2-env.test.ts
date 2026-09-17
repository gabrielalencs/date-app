import { describe, expect, it } from "vitest";

import {
  DEV_BUCKET,
  PROD_BUCKET,
  R2ConfigError,
  assertBucketMatchesBranch,
  assertCredentialShape,
  describeTarget,
  readR2Config,
  resolveR2,
} from "@/features/media/r2/env";

const CONTA = "abc123conta";
/* Formato real, valor inventado: a guarda de credencial confere formato, entao
   um fixture com "chave-de-teste" faria todo teste deste arquivo falhar por
   motivo errado. */
const CHAVE = "0123456789abcdef0123456789abcdef";
const SEGREDO = "0123456789abcdef".repeat(4);

function env(overrides: Record<string, string | undefined> = {}) {
  return {
    NEON_BRANCH: "development",
    R2_ACCOUNT_ID: CONTA,
    R2_ACCESS_KEY_ID: CHAVE,
    R2_SECRET_ACCESS_KEY: SEGREDO,
    R2_BUCKET: DEV_BUCKET,
    R2_ENDPOINT: `https://${CONTA}.r2.cloudflarestorage.com`,
    ...overrides,
  };
}

describe("readR2Config", () => {
  it("lista as variáveis que faltam, sem revelar as que existem", () => {
    const erro = (() => {
      try {
        readR2Config({ R2_BUCKET: DEV_BUCKET });
        return null;
      } catch (e) {
        return e as Error;
      }
    })();

    expect(erro).toBeInstanceOf(R2ConfigError);
    expect(erro?.message).toContain("R2_ACCOUNT_ID");
    expect(erro?.message).toContain("R2_SECRET_ACCESS_KEY");
    expect(erro?.message).toContain("R2_ENDPOINT");
    expect(erro?.message).not.toContain(DEV_BUCKET.slice(0, 4) + "=");
  });

  it("trata string em branco como ausente", () => {
    expect(() => readR2Config(env({ R2_ACCESS_KEY_ID: "   " }))).toThrow(
      /R2_ACCESS_KEY_ID/,
    );
  });
});

describe("assertCredentialShape", () => {
  it("aceita o par de formato correto", () => {
    expect(() => assertCredentialShape(readR2Config(env()))).not.toThrow();
  });

  /* O erro que motivou a guarda: o painel do Cloudflare mostra o Token value em
     destaque, e ele nao assina requisicao S3. Sem esta guarda o sintoma so
     aparece no navegador, como 400 InvalidArgument num PUT para o R2. */
  it("recusa o Token value do Cloudflare no lugar do Access Key ID", () => {
    const erro = (() => {
      try {
        assertCredentialShape(
          readR2Config(env({ R2_ACCESS_KEY_ID: `cfat_${"A".repeat(48)}` })),
        );
        return null;
      } catch (e) {
        return e as Error;
      }
    })();

    expect(erro).toBeInstanceOf(R2ConfigError);
    expect(erro?.message).toContain("Access Key ID");
    expect(erro?.message).toContain("400 InvalidArgument");
    // Nomeia o campo do painel; nunca repete o valor que leu.
    expect(erro?.message).not.toContain("AAAA");
  });

  it("recusa um secret fora do formato sem repetir o valor", () => {
    const erro = (() => {
      try {
        assertCredentialShape(
          readR2Config(env({ R2_SECRET_ACCESS_KEY: "segredo-curto" })),
        );
        return null;
      } catch (e) {
        return e as Error;
      }
    })();

    expect(erro).toBeInstanceOf(R2ConfigError);
    expect(erro?.message).toContain("Secret Access Key");
    expect(erro?.message).not.toContain("segredo-curto");
  });

  it("resolveR2 aplica a guarda de credencial", () => {
    expect(() =>
      resolveR2(env({ R2_ACCESS_KEY_ID: `cfat_${"A".repeat(48)}` })),
    ).toThrow(R2ConfigError);
  });
});

describe("assertBucketMatchesBranch", () => {
  it("aceita development apontada para o bucket de development", () => {
    const alvo = assertBucketMatchesBranch(readR2Config(env()), "development");

    expect(alvo).toEqual({
      bucket: DEV_BUCKET,
      endpoint: `${CONTA}.r2.cloudflarestorage.com`,
      branch: "development",
    });
  });

  it("aborta quando development aponta para o bucket de produção", () => {
    expect(() =>
      assertBucketMatchesBranch(
        readR2Config(env({ R2_BUCKET: PROD_BUCKET })),
        "development",
      ),
    ).toThrow(/ABORTADO/);
  });

  it("aborta com qualquer outro bucket em development", () => {
    expect(() =>
      assertBucketMatchesBranch(
        readR2Config(env({ R2_BUCKET: "date-media-teste" })),
        "development",
      ),
    ).toThrow(/date-media-dev/);
  });

  it("aceita production apontada para o bucket de produção", () => {
    const alvo = assertBucketMatchesBranch(
      readR2Config(env({ NEON_BRANCH: "production", R2_BUCKET: PROD_BUCKET })),
      "production",
    );

    expect(alvo.bucket).toBe(PROD_BUCKET);
  });

  /* O erro mais provável do deploy: copiar as variáveis de development para a
     Vercel e esquecer o R2_BUCKET. Sem esta guarda, foto real iria para o
     bucket de teste em silêncio. */
  it("aborta quando production aponta para o bucket de development", () => {
    expect(() =>
      assertBucketMatchesBranch(
        readR2Config(env({ NEON_BRANCH: "production" })),
        "production",
      ),
    ).toThrow(/ABORTADO/);
  });

  it("aborta com qualquer outro bucket em production", () => {
    expect(() =>
      assertBucketMatchesBranch(
        readR2Config(
          env({ NEON_BRANCH: "production", R2_BUCKET: "date-media-teste" }),
        ),
        "production",
      ),
    ).toThrow(/date-media-prod/);
  });

  it("aborta quando o endpoint é de outra conta", () => {
    expect(() =>
      assertBucketMatchesBranch(
        readR2Config(
          env({ R2_ENDPOINT: "https://outra.r2.cloudflarestorage.com" }),
        ),
        "development",
      ),
    ).toThrow(/não pertence à conta/);
  });

  it("aceita endpoint com jurisdição, que mantém a conta no host", () => {
    expect(() =>
      assertBucketMatchesBranch(
        readR2Config(
          env({ R2_ENDPOINT: `https://${CONTA}.eu.r2.cloudflarestorage.com` }),
        ),
        "development",
      ),
    ).not.toThrow();
  });

  it("recusa endpoint que não é URL", () => {
    expect(() =>
      assertBucketMatchesBranch(
        readR2Config(env({ R2_ENDPOINT: "date-media-dev" })),
        "development",
      ),
    ).toThrow(/não é uma URL válida/);
  });
});

describe("o que a guarda imprime", () => {
  it("mostra branch, bucket e endpoint, e nenhuma credencial", () => {
    const { config, target } = resolveR2(env());
    const saida = describeTarget(target);

    expect(saida).toContain(DEV_BUCKET);
    expect(saida).toContain(`${CONTA}.r2.cloudflarestorage.com`);
    expect(saida).not.toContain(config.accessKeyId);
    expect(saida).not.toContain(config.secretAccessKey);
  });
});
