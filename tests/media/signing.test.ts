import { beforeAll, describe, expect, it } from "vitest";

import { MAX_BYTES, SIGNED_URL_TTL_SECONDS } from "@/features/media/constants";

/**
 * Regressão da armadilha do presigner (verificada em @aws-sdk/client-s3
 * 3.1129.0 e @aws-sdk/s3-request-presigner 3.1129.0).
 *
 * O `S3RequestPresigner.prepareRequest` faz `unsignableHeaders.add("content-type")`.
 * Um `PutObjectCommand({ ContentType })` sozinho gera `X-Amz-SignedHeaders=host`,
 * e o content-type **não** fica fixo: quem tiver a URL sobe o que quiser com o
 * tipo que quiser. Só `signableHeaders: new Set(["content-type"])` corrige.
 *
 * Este arquivo existe para que remover aquela linha quebre o portão, em vez de
 * abrir a assinatura em silêncio. Não faz rede: assinar é operação local.
 */
const CONTA = "abc123conta";
const CHAVE =
  "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/44444444-4444-4444-8444-444444444444/full.webp";

type SignUpload = typeof import("@/features/media/r2/client").signUpload;

let signUpload: SignUpload;

beforeAll(async () => {
  process.env.NEON_BRANCH = "development";
  process.env.R2_ACCOUNT_ID = CONTA;
  process.env.R2_ACCESS_KEY_ID = "AKIADETESTE";
  process.env.R2_SECRET_ACCESS_KEY = "segredo-de-teste-sem-valor";
  process.env.R2_BUCKET = "date-media-dev";
  process.env.R2_ENDPOINT = `https://${CONTA}.r2.cloudflarestorage.com`;

  ({ signUpload } = await import("@/features/media/r2/client"));
});

async function assinar(overrides: Partial<Parameters<SignUpload>[0]> = {}) {
  const assinada = await signUpload({
    objectKey: CHAVE,
    variant: "full",
    contentType: "image/webp",
    contentLength: 900_000,
    ...overrides,
  });

  return { assinada, query: new URL(assinada.url).searchParams };
}

describe("signUpload", () => {
  it("fixa content-type e content-length na assinatura", async () => {
    const { query } = await assinar();
    const assinados = (query.get("X-Amz-SignedHeaders") ?? "").split(";");

    expect(assinados).toContain("content-type");
    expect(assinados).toContain("content-length");
    expect(assinados).toContain("host");
  });

  it("expira em minutos, não em horas", async () => {
    const { query, assinada } = await assinar();

    expect(Number(query.get("X-Amz-Expires"))).toBe(SIGNED_URL_TTL_SECONDS);
    expect(assinada.expiresInSeconds).toBeLessThanOrEqual(15 * 60);
  });

  it("aponta para o bucket de development e para a chave pedida", async () => {
    const { assinada } = await assinar();
    const url = new URL(assinada.url);

    expect(url.host).toBe(`${CONTA}.r2.cloudflarestorage.com`);
    expect(url.pathname).toBe(`/date-media-dev/${CHAVE}`);
  });

  it("não leva o segredo na URL", async () => {
    const { assinada } = await assinar();

    expect(assinada.url).not.toContain("segredo-de-teste-sem-valor");
  });

  it("recusa MIME fora dos três permitidos", async () => {
    for (const contentType of [
      "image/gif",
      "image/svg+xml",
      "text/html",
      "application/octet-stream",
    ]) {
      await expect(assinar({ contentType })).rejects.toThrow(/não permitido/);
    }
  });

  it("recusa tamanho acima do teto da variante", async () => {
    await expect(
      assinar({ variant: "full", contentLength: MAX_BYTES.full + 1 }),
    ).rejects.toThrow(/fora do permitido/);

    await expect(
      assinar({ variant: "thumb", contentLength: MAX_BYTES.thumb + 1 }),
    ).rejects.toThrow(/fora do permitido/);
  });

  it("recusa tamanho ausente, zero ou negativo", async () => {
    for (const contentLength of [0, -1, 1.5, Number.NaN]) {
      await expect(assinar({ contentLength })).rejects.toThrow(
        /fora do permitido/,
      );
    }
  });
});
