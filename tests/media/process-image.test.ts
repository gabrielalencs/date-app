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

function fakeFile(size: number, type = "image/jpeg", name = "foto.jpg"): File {
  // O conteúdo não é lido: quem decodifica é o runtime, que aqui é falso.
  return {
    size,
    type,
    name,
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

    const erro = await processImageFile(
      fakeFile(3_000_000, "image/png", "Screenshot_2026-09-17.png"),
      runtime,
    ).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ImageProcessingError);
    /* O print de Android não pode receber explicação sobre iPhone: a mensagem
       antiga afirmava HEIC para qualquer recusa do decodificador, e era isso
       que mandava a pessoa procurar um problema que o arquivo não tinha. */
    expect((erro as Error).message).not.toMatch(/HEIC/);
    expect((erro as Error).message).not.toMatch(/iPhone/);
    // Diz o que se sabe do arquivo, para a mensagem ser acionável.
    expect((erro as Error).message).toMatch(/image\/png/);
    expect((erro as Error).message).toMatch(/KB/);
  });

  it("só fala de HEIC quando o arquivo é HEIC", async () => {
    const { runtime } = fakeRuntime({
      width: 0,
      height: 0,
      failDecode: true,
    });

    for (const arquivo of [
      fakeFile(3_000_000, "image/heic", "IMG_0001.heic"),
      // `type` vazio é o que o share sheet entrega; sobra a extensão.
      fakeFile(3_000_000, "", "IMG_0002.HEIF"),
    ]) {
      const erro = await processImageFile(arquivo, runtime).catch(
        (e: unknown) => e,
      );

      expect((erro as Error).message, arquivo.name).toMatch(/HEIC/);
    }
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

  /**
   * O `type` do seletor de arquivos do Android não é confiável: arquivo vindo
   * de outro app, de cartão ou de pasta não indexada chega como
   * `application/octet-stream` ou sem tipo nenhum. Recusar por isso era barrar
   * imagem legítima antes de olhar para ela.
   */
  it("deixa o decodificador decidir quando o tipo não diz nada", async () => {
    for (const tipo of ["application/octet-stream", "", "image/png"]) {
      const { runtime } = fakeRuntime({ width: 1200, height: 900 });

      await expect(
        processImageFile(fakeFile(2_000_000, tipo, "arquivo"), runtime),
      ).resolves.toBeDefined();
      expect(runtime.decode, tipo).toHaveBeenCalled();
    }
  });

  it("continua recusando de cara o que sabidamente não é imagem", async () => {
    for (const tipo of [
      "video/mp4",
      "audio/mpeg",
      "application/pdf",
      "text/plain",
    ]) {
      const { runtime } = fakeRuntime({ width: 100, height: 100 });

      await expect(
        processImageFile(fakeFile(1000, tipo), runtime),
        tipo,
      ).rejects.toThrow(ImageProcessingError);
      expect(runtime.decode, tipo).not.toHaveBeenCalled();
    }
  });
});

/**
 * A escada de tamanho.
 *
 * Antes existia só a de qualidade: três encodes no mesmo tamanho e, se nenhum
 * coubesse, recusa. Print muito longo e foto com muito detalhe fino eram
 * rejeitados por um teto que reduzir 25% resolve.
 */
describe("quando a qualidade sozinha não faz caber", () => {
  it("reduz o tamanho e envia, em vez de recusar", async () => {
    const cheio = scaleToFit({ width: 4000, height: 3000 }, MAX_EDGE.full);

    const { runtime, encodes } = fakeRuntime({
      width: 4000,
      height: 3000,
      /* Nada cabe no tamanho cheio; tudo cabe assim que o tamanho cede. */
      bytesFor: ({ variant, size }) =>
        variant === "full" && size.width === cheio.width
          ? MAX_BYTES.full + 1
          : 1024,
    });

    const resultado = await processImageFile(fakeFile(9_000_000), runtime);

    // Saiu com menos pixels que o teto, e saiu.
    expect(resultado.full.width).toBeLessThan(cheio.width);
    expect(resultado.full.width).toBe(Math.round(cheio.width * 0.75));
    // A altura acompanha: proporção preservada.
    expect(resultado.full.height).toBe(Math.round(cheio.height * 0.75));

    // Só desceu de tamanho depois de esgotar a qualidade no tamanho cheio.
    const noCheio = encodes.filter(
      (e) => e.variant === "full" && e.size.width === cheio.width,
    );
    expect(noCheio).toHaveLength(QUALITY_LADDER.length);
  });

  it("desiste quando nem metade dos pixels na pior qualidade cabe", async () => {
    const { runtime } = fakeRuntime({
      width: 4000,
      height: 3000,
      bytesFor: () => MAX_BYTES.full + 1,
    });

    await expect(
      processImageFile(fakeFile(9_000_000), runtime),
    ).rejects.toThrow(/acima do limite de envio/i);
  });
});
