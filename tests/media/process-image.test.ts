import { describe, expect, it, vi } from "vitest";

import {
  MAX_BYTES,
  MAX_EDGE,
  MAX_INPUT_BYTES,
  OUTPUT_MIME,
  QUALITY_LADDER,
} from "@/features/media/constants";
import {
  ImageProcessingError,
  assertAcceptableInput,
  processImageFile,
  scaleToFit,
  type DecodedImage,
  type EncodeRequest,
  type ImageRuntime,
} from "@/features/media/image/process-image";

/**
 * O que dá para provar sem navegador: a matemática da redução, a validação de
 * entrada, a ordem das chamadas e as mensagens de erro. A decodificação real e
 * o descarte do EXIF ficam para a verificação em Playwright — este arquivo não
 * afirma nada sobre eles.
 */

type FakeImage = DecodedImage & { closed: boolean };

function fakeFile(size: number, type = "image/jpeg"): File {
  // O conteúdo não é lido: quem decodifica é o runtime, que aqui é falso.
  return {
    size,
    type,
    name: "foto.jpg",
  } as File;
}

function fakeRuntime(options: {
  width: number;
  height: number;
  /** Bytes devolvidos por qualidade pedida. */
  bytesFor?: (request: EncodeRequest) => number;
  failDecode?: boolean;
}) {
  const image: FakeImage = {
    width: options.width,
    height: options.height,
    closed: false,
    close() {
      this.closed = true;
    },
  };

  const encodes: EncodeRequest[] = [];

  const runtime: ImageRuntime<FakeImage> = {
    decode: vi.fn(async () => {
      if (options.failDecode) {
        throw new DOMException("The source image cannot be decoded.");
      }
      return image;
    }),
    encode: vi.fn(async (_image, request) => {
      encodes.push(request);
      const size = options.bytesFor?.(request) ?? 1024;
      return { size, type: OUTPUT_MIME } as Blob;
    }),
  };

  return { runtime, image, encodes };
}

describe("scaleToFit", () => {
  it("reduz o maior lado até o teto e preserva a proporção", () => {
    expect(scaleToFit({ width: 4032, height: 3024 }, 2000)).toEqual({
      width: 2000,
      height: 1500,
    });
  });

  it("usa a altura quando o retrato é o maior lado", () => {
    expect(scaleToFit({ width: 3024, height: 4032 }, 640)).toEqual({
      width: 480,
      height: 640,
    });
  });

  it("nunca amplia", () => {
    expect(scaleToFit({ width: 800, height: 600 }, 2000)).toEqual({
      width: 800,
      height: 600,
    });
  });

  it("não deixa o lado curto virar zero", () => {
    const { width, height } = scaleToFit({ width: 5000, height: 2 }, 640);
    expect(width).toBe(640);
    expect(height).toBeGreaterThanOrEqual(1);
  });
});

describe("assertAcceptableInput", () => {
  it("recusa arquivo vazio", () => {
    expect(() => assertAcceptableInput(fakeFile(0))).toThrow(
      ImageProcessingError,
    );
  });

  it("recusa entrada acima do teto sem tentar decodificar", () => {
    expect(() => assertAcceptableInput(fakeFile(MAX_INPUT_BYTES + 1))).toThrow(
      /grande demais/i,
    );
  });

  it("recusa arquivo que não é imagem", () => {
    expect(() =>
      assertAcceptableInput(fakeFile(1000, "application/pdf")),
    ).toThrow(/não é uma imagem/i);
  });

  it("deixa passar tipo vazio e delega ao decodificador", () => {
    expect(() => assertAcceptableInput(fakeFile(1000, ""))).not.toThrow();
  });
});

describe("processImageFile", () => {
  it("devolve full em 2000px e thumb em 640px, ambos WebP", async () => {
    const { runtime } = fakeRuntime({ width: 4032, height: 3024 });

    const resultado = await processImageFile(fakeFile(5_000_000), runtime);

    expect(resultado.source).toEqual({ width: 4032, height: 3024 });
    expect(resultado.full).toMatchObject({
      variant: "full",
      width: MAX_EDGE.full,
      height: 1500,
      mimeType: OUTPUT_MIME,
    });
    expect(resultado.thumb).toMatchObject({
      variant: "thumb",
      width: MAX_EDGE.thumb,
      height: 480,
      mimeType: OUTPUT_MIME,
    });
  });

  it("encoda na qualidade nominal quando já cabe", async () => {
    const { runtime, encodes } = fakeRuntime({ width: 1200, height: 1200 });

    await processImageFile(fakeFile(900_000), runtime);

    expect(encodes).toHaveLength(2);
    expect(encodes.every((e) => e.quality === QUALITY_LADDER[0])).toBe(true);
  });

  it("cai um degrau de qualidade quando estoura o teto", async () => {
    const { runtime, encodes } = fakeRuntime({
      width: 4032,
      height: 3024,
      bytesFor: ({ variant, quality }) =>
        variant === "full" && quality === QUALITY_LADDER[0]
          ? MAX_BYTES.full + 1
          : 1024,
    });

    const resultado = await processImageFile(fakeFile(8_000_000), runtime);

    const doFull = encodes.filter((e) => e.variant === "full");
    expect(doFull.map((e) => e.quality)).toEqual([
      QUALITY_LADDER[0],
      QUALITY_LADDER[1],
    ]);
    expect(resultado.full.blob.size).toBeLessThanOrEqual(MAX_BYTES.full);
  });

  it("desiste depois da escada inteira, com mensagem para a pessoa", async () => {
    const { runtime } = fakeRuntime({
      width: 4032,
      height: 3024,
      bytesFor: () => MAX_BYTES.full + 1,
    });

    await expect(
      processImageFile(fakeFile(8_000_000), runtime),
    ).rejects.toThrow(/acima do limite de envio/i);
  });

  it("traduz falha de decodificação em instrução, não em exceção crua", async () => {
    const { runtime } = fakeRuntime({
      width: 0,
      height: 0,
      failDecode: true,
    });

    const erro = await processImageFile(fakeFile(3_000_000), runtime).catch(
      (e: unknown) => e,
    );

    expect(erro).toBeInstanceOf(ImageProcessingError);
    expect((erro as Error).message).toMatch(/HEIC/);
    expect((erro as Error).message).toMatch(/exporte como JPEG/i);
  });

  it("libera o bitmap mesmo quando o encode falha", async () => {
    const { runtime, image } = fakeRuntime({
      width: 4032,
      height: 3024,
      bytesFor: () => MAX_BYTES.full + 1,
    });

    await expect(
      processImageFile(fakeFile(8_000_000), runtime),
    ).rejects.toThrow();
    expect(image.closed).toBe(true);
  });

  it("não decodifica quando a entrada já é inaceitável", async () => {
    const { runtime } = fakeRuntime({ width: 100, height: 100 });

    await expect(
      processImageFile(fakeFile(1000, "video/mp4"), runtime),
    ).rejects.toThrow(ImageProcessingError);
    expect(runtime.decode).not.toHaveBeenCalled();
  });
});
