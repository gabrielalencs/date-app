import { describe, expect, it, vi } from "vitest";

import { OUTPUT_MIME } from "@/features/media/constants";
import type { StartedUpload } from "@/features/media/contract";
import type {
  DecodedImage,
  ImageRuntime,
} from "@/features/media/image/process-image";
import { uploadPhoto, type UploadPorts } from "@/features/media/upload-flow";

/**
 * A ordem do fluxo é o que importa aqui: processa, assina, sobe as duas
 * variantes, e só então confirma. Se a confirmação acontecesse antes do PUT,
 * a linha nasceria apontando para objeto inexistente.
 */
const PLANO = "22222222-2222-4222-8222-222222222222";
const UPLOAD = "44444444-4444-4444-8444-444444444444";

function runtime(): ImageRuntime<DecodedImage> {
  return {
    decode: async () => ({ width: 4000, height: 3000, close: () => {} }),
    encode: async () => ({ size: 50_000, type: OUTPUT_MIME }) as Blob,
  };
}

const ASSINADA: StartedUpload = {
  uploadId: UPLOAD,
  full: {
    url: "https://r2.exemplo/full",
    contentType: OUTPUT_MIME,
    contentLength: 50_000,
    expiresInSeconds: 300,
  },
  thumb: {
    url: "https://r2.exemplo/thumb",
    contentType: OUTPUT_MIME,
    contentLength: 50_000,
    expiresInSeconds: 300,
  },
};

function ports(overrides: Partial<UploadPorts> = {}) {
  const chamadas: string[] = [];

  const base: UploadPorts = {
    runtime: runtime(),
    start: vi.fn(async () => {
      chamadas.push("start");
      return { ok: true as const, data: ASSINADA };
    }),
    put: vi.fn(async (url: string) => {
      chamadas.push(`put:${url.endsWith("thumb") ? "thumb" : "full"}`);
      return { status: 200 };
    }),
    confirm: vi.fn(async () => {
      chamadas.push("confirm");
      return { ok: true as const, data: { mediaId: "media-1" } };
    }),
    ...overrides,
  };

  return { ports: base, chamadas };
}

const arquivo = { size: 4_000_000, type: "image/jpeg", name: "f.jpg" } as File;

describe("uploadPhoto", () => {
  it("assina, sobe as duas variantes e só então confirma", async () => {
    const { ports: p, chamadas } = ports();

    const resultado = await uploadPhoto(p, {
      file: arquivo,
      planId: PLANO,
      purpose: "cover",
    });

    expect(resultado).toEqual({ ok: true, mediaId: "media-1" });
    expect(chamadas).toEqual(["start", "put:full", "put:thumb", "confirm"]);
  });

  it("manda para assinatura o tamanho medido, não o do arquivo original", async () => {
    const { ports: p } = ports();

    await uploadPhoto(p, { file: arquivo, planId: PLANO, purpose: "cover" });

    expect(p.start).toHaveBeenCalledWith({
      planId: PLANO,
      purpose: "cover",
      contentType: OUTPUT_MIME,
      sizes: { full: 50_000, thumb: 50_000 },
    });
  });

  it("confirma com o uploadId que o servidor devolveu, e nunca com chave", async () => {
    const { ports: p } = ports();

    await uploadPhoto(p, { file: arquivo, planId: PLANO, purpose: "gallery" });

    const enviado = vi.mocked(p.confirm).mock.calls[0]?.[0];
    expect(enviado).toMatchObject({ uploadId: UPLOAD, planId: PLANO });
    expect(JSON.stringify(enviado)).not.toMatch(/webp|objectKey|object_key/i);
  });

  it("não confirma quando o PUT do full falha", async () => {
    const { ports: p, chamadas } = ports({
      put: vi.fn(async () => ({ status: 500 })),
    });

    const resultado = await uploadPhoto(p, {
      file: arquivo,
      planId: PLANO,
      purpose: "cover",
    });

    expect(resultado.ok).toBe(false);
    expect(chamadas).not.toContain("confirm");
    expect(p.confirm).not.toHaveBeenCalled();
  });

  it("não confirma quando só o thumb falha", async () => {
    let n = 0;
    const { ports: p } = ports({
      put: vi.fn(async () => ({ status: ++n === 1 ? 200 : 500 })),
    });

    const resultado = await uploadPhoto(p, {
      file: arquivo,
      planId: PLANO,
      purpose: "cover",
    });

    expect(resultado.ok).toBe(false);
    expect(p.confirm).not.toHaveBeenCalled();
  });

  it("403 no PUT vira mensagem de assinatura expirada, não de permissão", async () => {
    const { ports: p } = ports({ put: vi.fn(async () => ({ status: 403 })) });

    const resultado = await uploadPhoto(p, {
      file: arquivo,
      planId: PLANO,
      purpose: "cover",
    });

    expect(resultado).toEqual({
      ok: false,
      error: expect.stringMatching(/expirou/i),
    });
  });

  it("erro de processamento não chega a pedir assinatura", async () => {
    const { ports: p } = ports({
      runtime: {
        decode: async () => {
          throw new DOMException("cannot decode");
        },
        encode: async () => ({ size: 1, type: OUTPUT_MIME }) as Blob,
      },
    });

    const resultado = await uploadPhoto(p, {
      file: arquivo,
      planId: PLANO,
      purpose: "cover",
    });

    expect(resultado.ok).toBe(false);
    expect(p.start).not.toHaveBeenCalled();
  });

  it("recusa do servidor na assinatura interrompe antes de qualquer PUT", async () => {
    const { ports: p } = ports({
      start: vi.fn(async () => ({ ok: false as const, error: "não pode" })),
    });

    const resultado = await uploadPhoto(p, {
      file: arquivo,
      planId: PLANO,
      purpose: "cover",
    });

    expect(resultado).toEqual({ ok: false, error: "não pode" });
    expect(p.put).not.toHaveBeenCalled();
  });
});
