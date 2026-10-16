import { describe, expect, it, vi } from "vitest";

import {
  MAX_VIDEO_BYTES,
  OUTPUT_MIME,
  VIDEO_MIME,
} from "@/features/media/constants";
import {
  VideoProcessingError,
  evenSize,
  inspectVideoFile,
  processVideoFile,
  targetVideoSize,
  type VideoProbe,
  type VideoRuntime,
} from "@/features/media/video/process-video";

/**
 * A orquestração do vídeo (D-184), com o navegador substituído por dublês. A
 * conversão real é provada no Playwright; aqui se prova a ordem, o tamanho
 * pedido e as recusas.
 */
const PROBE_4K_EM_PE: VideoProbe = {
  width: 2160,
  height: 3840,
  durationSeconds: 312.4,
};

const arquivo = {
  size: 900 * 1024 * 1024,
  type: "video/mp4",
  name: "VID_20261011_201512.mp4",
} as File;

function runtime(overrides: Partial<VideoRuntime> = {}): VideoRuntime {
  return {
    probe: vi.fn(async () => PROBE_4K_EM_PE),
    transcode: vi.fn(async () => ({
      blob: { size: 18_000_000, type: VIDEO_MIME } as Blob,
      width: 720,
      height: 1280,
      durationSeconds: 60.03,
    })),
    poster: vi.fn(async () => ({
      variant: "thumb" as const,
      blob: { size: 40_000, type: OUTPUT_MIME } as Blob,
      mimeType: OUTPUT_MIME,
      width: 360,
      height: 640,
    })),
    ...overrides,
  };
}

describe("targetVideoSize", () => {
  it("leva o maior lado a 1280 e preserva a orientação", () => {
    expect(targetVideoSize({ width: 3840, height: 2160 })).toEqual({
      width: 1280,
      height: 720,
    });
    expect(targetVideoSize({ width: 2160, height: 3840 })).toEqual({
      width: 720,
      height: 1280,
    });
  });

  it("nunca amplia", () => {
    expect(targetVideoSize({ width: 640, height: 360 })).toEqual({
      width: 640,
      height: 360,
    });
  });

  it("os dois lados saem pares, exigência do H.264", () => {
    expect(evenSize({ width: 721, height: 405 })).toEqual({
      width: 720,
      height: 404,
    });
    expect(evenSize({ width: 1, height: 1 })).toEqual({ width: 2, height: 2 });

    const reduzido = targetVideoSize({ width: 1918, height: 1078 });
    expect(reduzido.width % 2).toBe(0);
    expect(reduzido.height % 2).toBe(0);
  });
});

describe("inspectVideoFile", () => {
  it("devolve o que a tela precisa para montar o corte", async () => {
    await expect(inspectVideoFile(arquivo, runtime())).resolves.toEqual(
      PROBE_4K_EM_PE,
    );
  });

  it("recusa arquivo vazio sem abrir", async () => {
    const r = runtime();

    await expect(
      inspectVideoFile({ ...arquivo, size: 0 } as File, r),
    ).rejects.toThrow(VideoProcessingError);
    expect(r.probe).not.toHaveBeenCalled();
  });

  it("recusa vídeo de menos de um segundo", async () => {
    await expect(
      inspectVideoFile(
        arquivo,
        runtime({
          probe: async () => ({ ...PROBE_4K_EM_PE, durationSeconds: 0.4 }),
        }),
      ),
    ).rejects.toThrow(/curto demais/);
  });

  it("recusa duração infinita ou dimensão zerada antes de montar a régua", async () => {
    for (const quebrado of [
      { ...PROBE_4K_EM_PE, durationSeconds: Number.POSITIVE_INFINITY },
      { ...PROBE_4K_EM_PE, durationSeconds: Number.NaN },
      { ...PROBE_4K_EM_PE, width: 0 },
      { ...PROBE_4K_EM_PE, height: Number.NaN },
    ]) {
      await expect(
        inspectVideoFile(arquivo, runtime({ probe: async () => quebrado })),
      ).rejects.toThrow(VideoProcessingError);
    }
  });
});

describe("processVideoFile", () => {
  it("converte o trecho no tamanho de 720p e devolve as duas variantes", async () => {
    const r = runtime();

    const processado = await processVideoFile(
      arquivo,
      { probe: PROBE_4K_EM_PE, window: { start: 125, end: 185 } },
      r,
    );

    expect(r.transcode).toHaveBeenCalledWith(arquivo, {
      window: { start: 125, end: 185 },
      size: { width: 720, height: 1280 },
      onProgress: undefined,
      signal: undefined,
    });
    expect(processado.full).toMatchObject({
      variant: "full",
      mimeType: VIDEO_MIME,
      width: 720,
      height: 1280,
    });
    expect(processado.thumb.mimeType).toBe(OUTPUT_MIME);
    expect(processado.durationMs).toBe(60_030);
  });

  it("o pôster sai do vídeo convertido, não do original", async () => {
    const r = runtime();

    const processado = await processVideoFile(
      arquivo,
      { probe: PROBE_4K_EM_PE, window: { start: 0, end: 60 } },
      r,
    );

    expect(r.poster).toHaveBeenCalledWith(processado.full.blob, undefined);
  });

  it("recusa trecho acima de 60 s antes de converter", async () => {
    const r = runtime();

    await expect(
      processVideoFile(
        arquivo,
        { probe: PROBE_4K_EM_PE, window: { start: 0, end: 90 } },
        r,
      ),
    ).rejects.toThrow(/entre 1 e 60 segundos/);
    expect(r.transcode).not.toHaveBeenCalled();
  });

  it("recusa a saída que estourou o teto de bytes, sem gerar pôster", async () => {
    const r = runtime({
      transcode: async () => ({
        blob: { size: MAX_VIDEO_BYTES + 1, type: VIDEO_MIME } as Blob,
        width: 720,
        height: 1280,
        durationSeconds: 60,
      }),
    });

    await expect(
      processVideoFile(
        arquivo,
        { probe: PROBE_4K_EM_PE, window: { start: 0, end: 60 } },
        r,
      ),
    ).rejects.toThrow(/acima do limite de envio/);
    expect(r.poster).not.toHaveBeenCalled();
  });

  it("recusa conversão que saiu mais longa que o trecho", async () => {
    const r = runtime({
      transcode: async () => ({
        blob: { size: 1_000, type: VIDEO_MIME } as Blob,
        width: 720,
        height: 1280,
        durationSeconds: 95,
      }),
    });

    await expect(
      processVideoFile(
        arquivo,
        { probe: PROBE_4K_EM_PE, window: { start: 0, end: 60 } },
        r,
      ),
    ).rejects.toThrow(VideoProcessingError);
  });

  it("recusa saída com duração ou tamanho inválidos, antes de subir e sem pôster", async () => {
    for (const saida of [
      { durationSeconds: Number.NaN, width: 720, height: 1280 },
      { durationSeconds: Number.POSITIVE_INFINITY, width: 720, height: 1280 },
      { durationSeconds: 0, width: 720, height: 1280 },
      { durationSeconds: 8, width: 0, height: 1280 },
      { durationSeconds: 8, width: 720, height: Number.NaN },
    ]) {
      const r = runtime({
        transcode: async () => ({
          blob: { size: 1_000, type: VIDEO_MIME } as Blob,
          ...saida,
        }),
      });

      await expect(
        processVideoFile(
          arquivo,
          { probe: PROBE_4K_EM_PE, window: { start: 0, end: 10 } },
          r,
        ),
        JSON.stringify(saida),
      ).rejects.toThrow(/sem produzir um vídeo válido/);
      expect(r.poster).not.toHaveBeenCalled();
    }
  });

  it("repassa o progresso da conversão", async () => {
    const progresso: number[] = [];
    const r = runtime({
      transcode: async (_file, pedido) => {
        pedido.onProgress?.(0.5);
        pedido.onProgress?.(1);
        return {
          blob: { size: 1_000, type: VIDEO_MIME } as Blob,
          width: 720,
          height: 1280,
          durationSeconds: 10,
        };
      },
    });

    await processVideoFile(
      arquivo,
      {
        probe: PROBE_4K_EM_PE,
        window: { start: 0, end: 10 },
        onProgress: (fracao) => progresso.push(fracao),
      },
      r,
    );

    expect(progresso).toEqual([0.5, 1]);
  });
});
