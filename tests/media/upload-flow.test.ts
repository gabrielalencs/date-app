import { describe, expect, it, vi } from "vitest";

import { OUTPUT_MIME, VIDEO_MIME } from "@/features/media/constants";
import type { StartedUpload } from "@/features/media/contract";
import type {
  DecodedImage,
  ImageRuntime,
} from "@/features/media/image/process-image";
import {
  uploadPhoto,
  uploadVideo,
  type PutOptions,
  type UploadPorts,
  type VideoUploadPorts,
  type VideoUploadStage,
} from "@/features/media/upload-flow";
import {
  VideoProcessingCanceled,
  VideoProcessingError,
  type ProcessedVideo,
  type VideoRuntime,
} from "@/features/media/video/process-video";

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

  it("foto confirma sem tipo nem duração, como antes do vídeo existir", async () => {
    const { ports: p } = ports();

    await uploadPhoto(p, { file: arquivo, planId: PLANO, purpose: "memory" });

    const enviado = vi.mocked(p.confirm).mock.calls[0]?.[0];
    expect(enviado).not.toHaveProperty("kind");
    expect(enviado).not.toHaveProperty("durationMs");
  });
});

/**
 * O vídeo (D-184): mesma ordem da foto, com a conversão no lugar do reencode,
 * o `purpose` sempre `memory`, e a confirmação dizendo que é vídeo e quanto
 * dura.
 */
describe("uploadVideo", () => {
  const PROBE = { width: 1920, height: 1080, durationSeconds: 300 };
  const VIDEO = { size: 18_000_000, type: VIDEO_MIME } as Blob;
  const POSTER = { size: 40_000, type: OUTPUT_MIME } as Blob;
  const filme = { size: 300_000_000, type: "video/mp4", name: "v.mp4" } as File;

  function videoRuntime(overrides: Partial<VideoRuntime> = {}): VideoRuntime {
    return {
      probe: async () => PROBE,
      transcode: async (_file, pedido) => {
        pedido.onProgress?.(0.5);
        return { blob: VIDEO, width: 1280, height: 720, durationSeconds: 42 };
      },
      poster: async () => ({
        variant: "thumb",
        blob: POSTER,
        mimeType: OUTPUT_MIME,
        width: 640,
        height: 360,
      }),
      ...overrides,
    };
  }

  function videoPorts(overrides: Partial<VideoUploadPorts> = {}) {
    const chamadas: string[] = [];

    const base: VideoUploadPorts = {
      runtime: videoRuntime(),
      start: vi.fn(async () => {
        chamadas.push("start");
        return { ok: true as const, data: ASSINADA };
      }),
      put: vi.fn(async (url: string, _body, _tipo, opcoes?: PutOptions) => {
        chamadas.push(`put:${url.endsWith("thumb") ? "thumb" : "full"}`);
        opcoes?.onProgress?.(1);
        return { status: 200 };
      }),
      confirm: vi.fn(async () => {
        chamadas.push("confirm");
        return { ok: true as const, data: { mediaId: "video-1" } };
      }),
      ...overrides,
    };

    return { ports: base, chamadas };
  }

  const pedido = {
    file: filme,
    planId: PLANO,
    probe: PROBE,
    window: { start: 30, end: 72 },
  };

  it("converte, assina como vídeo de memória, sobe as duas e confirma com a duração", async () => {
    const { ports: p, chamadas } = videoPorts();

    const resultado = await uploadVideo(p, pedido);

    expect(resultado).toEqual({ ok: true, mediaId: "video-1" });
    /* O pôster primeiro: as duas URLs vencem juntas, e o vídeo grande num
       sinal fraco deixaria o pôster começar com a assinatura vencida. */
    expect(chamadas).toEqual(["start", "put:thumb", "put:full", "confirm"]);
    expect(p.start).toHaveBeenCalledWith({
      planId: PLANO,
      purpose: "memory",
      contentType: VIDEO_MIME,
      sizes: { full: VIDEO.size, thumb: POSTER.size },
    });
    expect(p.confirm).toHaveBeenCalledWith({
      planId: PLANO,
      uploadId: UPLOAD,
      purpose: "memory",
      kind: "video",
      width: 1280,
      height: 720,
      durationMs: 42_000,
    });
  });

  it("conta as etapas em ordem, e o envio nunca volta para trás", async () => {
    const { ports: p } = videoPorts();
    const etapas: VideoUploadStage[] = [];

    await uploadVideo(p, { ...pedido, onStage: (e) => etapas.push(e) });

    expect(etapas[0]).toEqual({ stage: "convertendo", fraction: 0.5 });
    expect(etapas.at(-1)).toEqual({ stage: "salvando" });

    const envio = etapas
      .filter((e) => e.stage === "enviando")
      .map((e) => e.fraction);
    expect(envio).toEqual([...envio].sort((a, b) => a - b));
    expect(envio.at(-1)).toBeCloseTo(1);
  });

  it("erro de conversão vira frase e não pede assinatura", async () => {
    const { ports: p } = videoPorts({
      runtime: videoRuntime({
        transcode: async () => {
          throw new VideoProcessingError("Esse vídeo foi gravado em HEVC.");
        },
      }),
    });

    const resultado = await uploadVideo(p, pedido);

    expect(resultado).toEqual({
      ok: false,
      error: "Esse vídeo foi gravado em HEVC.",
    });
    expect(p.start).not.toHaveBeenCalled();
  });

  it("falha no PUT do vídeo não confirma, e a mensagem fala de vídeo", async () => {
    const { ports: p } = videoPorts({
      put: vi.fn(async () => ({ status: 0 })),
    });

    const resultado = await uploadVideo(p, pedido);

    expect(resultado).toEqual({
      ok: false,
      error: expect.stringMatching(/envio do vídeo falhou/),
    });
    expect(p.confirm).not.toHaveBeenCalled();
  });

  it("entrega o vídeo convertido, e a nova tentativa sobe sem converter de novo", async () => {
    const transcode = vi.fn(videoRuntime().transcode);
    const guardados: ProcessedVideo[] = [];

    const falhou = videoPorts({
      runtime: videoRuntime({ transcode }),
      put: vi.fn(async () => ({ status: 0 })),
    });
    const primeira = await uploadVideo(falhou.ports, {
      ...pedido,
      onProcessed: (video) => guardados.push(video),
    });

    expect(primeira.ok).toBe(false);
    expect(transcode).toHaveBeenCalledTimes(1);
    expect(guardados).toHaveLength(1);

    const etapas: VideoUploadStage[] = [];
    const deNovo = videoPorts({ runtime: videoRuntime({ transcode }) });
    const segunda = await uploadVideo(deNovo.ports, {
      ...pedido,
      reuse: guardados[0],
      onProcessed: (video) => guardados.push(video),
      onStage: (e) => etapas.push(e),
    });

    expect(segunda).toEqual({ ok: true, mediaId: "video-1" });
    expect(transcode).toHaveBeenCalledTimes(1);
    expect(guardados).toHaveLength(1);
    expect(etapas.some((e) => e.stage === "convertendo")).toBe(false);
    expect(deNovo.chamadas).toEqual([
      "start",
      "put:thumb",
      "put:full",
      "confirm",
    ]);
  });

  it("confirmação que caiu é refeita sem subir os arquivos de novo", async () => {
    const enviados: (string | null)[] = [];

    const caiu = videoPorts({
      confirm: vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    });
    await expect(
      uploadVideo(caiu.ports, {
        ...pedido,
        onSent: (id) => enviados.push(id),
      }),
    ).rejects.toThrow("Failed to fetch");
    expect(enviados).toEqual([UPLOAD]);

    const deNovo = videoPorts();
    const resultado = await uploadVideo(deNovo.ports, {
      ...pedido,
      reuse: {
        full: {
          variant: "full",
          blob: VIDEO,
          mimeType: VIDEO_MIME,
          width: 1280,
          height: 720,
        },
        thumb: {
          variant: "thumb",
          blob: POSTER,
          mimeType: OUTPUT_MIME,
          width: 640,
          height: 360,
        },
        durationMs: 42_000,
      },
      sentUploadId: UPLOAD,
    });

    expect(resultado).toEqual({ ok: true, mediaId: "video-1" });
    // Só a confirmação: nada assinado, nada subido.
    expect(deNovo.chamadas).toEqual(["confirm"]);
    expect(deNovo.ports.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ uploadId: UPLOAD, kind: "video" }),
    );
  });

  it("confirmação recusada pelo servidor libera a próxima tentativa para subir de novo", async () => {
    const enviados: (string | null)[] = [];
    const { ports: p } = videoPorts({
      confirm: vi.fn(async () => ({
        ok: false as const,
        error: "O vídeo enviado não passou na conferência.",
      })),
    });

    const resultado = await uploadVideo(p, {
      ...pedido,
      onSent: (id) => enviados.push(id),
    });

    expect(resultado).toEqual({
      ok: false,
      error: "O vídeo enviado não passou na conferência.",
    });
    expect(enviados).toEqual([UPLOAD, null]);
  });

  it("cancelar no meio do envio sobe como cancelamento, não como erro", async () => {
    const controle = new AbortController();
    const { ports: p } = videoPorts({
      put: vi.fn(async () => {
        controle.abort();
        throw new DOMException("Envio cancelado.", "AbortError");
      }),
    });

    await expect(
      uploadVideo(p, { ...pedido, signal: controle.signal }),
    ).rejects.toThrow(VideoProcessingCanceled);
    expect(p.confirm).not.toHaveBeenCalled();
  });
});
