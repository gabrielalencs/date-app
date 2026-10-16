import {
  VIDEO_MIME,
  type MediaKind,
  type UploadablePurpose,
} from "@/features/media/constants";
import {
  ImageProcessingError,
  processImageFile,
  type ImageRuntime,
  type ProcessedImage,
  type ProcessedVariant,
} from "@/features/media/image/process-image";
import type { StartedUpload } from "@/features/media/contract";
import {
  VideoProcessingCanceled,
  VideoProcessingError,
  processVideoFile,
  type ProcessedVideo,
  type VideoProbe,
  type VideoRuntime,
} from "@/features/media/video/process-video";
import type { TrimWindow } from "@/features/media/video/trim-window";

/**
 * O fluxo de upload, sem React e sem `window`, para ser testável de ponta a
 * ponta com dublês (seção 2 do docs/MEDIA_R2.md):
 *
 *   processa → pede assinatura → PUT direto no R2 → confirma no servidor
 *
 * O servidor é quem gera a object key e quem confirma; aqui só se conduz a
 * ordem. Nada nesta função conhece o host do R2 além da URL que o servidor
 * devolveu assinada.
 *
 * Foto e vídeo (D-184) passam pela mesma ordem e pelas mesmas portas. O que
 * muda é o processamento — reencode da imagem, ou conversão do trecho — e o
 * vídeo informar, na confirmação, que é vídeo e quanto dura.
 */
export type PutOptions = {
  /** Fração enviada, de 0 a 1. Só o vídeo usa: a foto sobe em um segundo. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
};

export type UploadPorts = {
  runtime: ImageRuntime;
  start(input: {
    planId: string;
    purpose: UploadablePurpose;
    contentType: string;
    sizes: { full: number; thumb: number };
  }): Promise<{ ok: true; data: StartedUpload } | { ok: false; error: string }>;
  confirm(input: {
    planId: string;
    uploadId: string;
    purpose: UploadablePurpose;
    width: number;
    height: number;
    kind?: MediaKind;
    durationMs?: number;
  }): Promise<
    { ok: true; data: { mediaId: string } } | { ok: false; error: string }
  >;
  put(
    url: string,
    body: Blob,
    contentType: string,
    options?: PutOptions,
  ): Promise<{ status: number }>;
};

export type VideoUploadPorts = Omit<UploadPorts, "runtime"> & {
  runtime: VideoRuntime;
};

export type UploadOutcome =
  { ok: true; mediaId: string } | { ok: false; error: string };

type Mensagens = { falhou: string; expirou: string };

const DA_IMAGEM: Mensagens = {
  falhou: "O envio da imagem falhou no meio do caminho. Tente de novo.",
  expirou:
    "A permissão de envio expirou antes de a imagem subir. Tente de novo.",
};

const DO_VIDEO: Mensagens = {
  falhou:
    "O envio do vídeo falhou no meio do caminho. Confira a conexão e tente " +
    "de novo.",
  expirou:
    "A permissão de envio expirou antes de o vídeo subir. Tente de novo.",
};

async function enviar(
  ports: Pick<UploadPorts, "put">,
  assinada: { url: string; contentType: string },
  variante: ProcessedVariant,
  mensagens: Mensagens,
  options?: PutOptions,
): Promise<string | null> {
  const { status } = await ports.put(
    assinada.url,
    variante.blob,
    assinada.contentType,
    options,
  );

  if (status === 200 || status === 201) {
    return null;
  }

  /* 403 aqui é assinatura: expirou, ou o corpo não bate com o tamanho e o
     tipo que foram assinados. Não é permissão da pessoa. */
  return status === 403 ? mensagens.expirou : mensagens.falhou;
}

export async function uploadPhoto(
  ports: UploadPorts,
  input: { file: File; planId: string; purpose: UploadablePurpose },
): Promise<UploadOutcome> {
  let processada: ProcessedImage;

  try {
    processada = await processImageFile(input.file, ports.runtime);
  } catch (error) {
    if (error instanceof ImageProcessingError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }

  const started = await ports.start({
    planId: input.planId,
    purpose: input.purpose,
    contentType: processada.full.mimeType,
    sizes: {
      full: processada.full.blob.size,
      thumb: processada.thumb.blob.size,
    },
  });

  if (!started.ok) {
    return started;
  }

  for (const [assinada, variante] of [
    [started.data.full, processada.full],
    [started.data.thumb, processada.thumb],
  ] as const) {
    const falha = await enviar(ports, assinada, variante, DA_IMAGEM);
    if (falha) {
      return { ok: false, error: falha };
    }
  }

  /* Só agora o produto sabe que a foto existe. Sem esta chamada, os objetos
     ficam no bucket e nenhuma linha é criada — que é o comportamento certo. */
  const confirmada = await ports.confirm({
    planId: input.planId,
    uploadId: started.data.uploadId,
    purpose: input.purpose,
    width: processada.full.width,
    height: processada.full.height,
  });

  return confirmada.ok
    ? { ok: true, mediaId: confirmada.data.mediaId }
    : confirmada;
}

/** Em que pé está o vídeo, para a tela dizer com palavras e porcentagem. */
export type VideoUploadStage =
  | { stage: "convertendo"; fraction: number }
  | { stage: "enviando"; fraction: number }
  | { stage: "salvando" };

/**
 * O vídeo: converte o trecho, assina, sobe as duas variantes e confirma.
 *
 * Sempre `memory` — vídeo só entra pela Galeria (D-184), e o servidor recusa
 * qualquer outro `purpose` de novo, nas duas pontas.
 *
 * Cancelar (`signal`) interrompe onde estiver — a conversão ou o PUT — e sobe
 * como `VideoProcessingCanceled`, que a tela engole: quem fechou a gaveta não
 * precisa de uma mensagem de erro dizendo que fechou.
 *
 * **Reaproveitar o que já foi feito.** Converter leva até um minuto no
 * celular, e subir 20 a 40 MB leva outro tanto; uma falha depois disso — sinal
 * que caiu, permissão expirada — não pode custar tudo de novo.
 *
 * - `onProcessed` entrega o vídeo convertido assim que ele existe, e `reuse`
 *   o recebe de volta no "Tentar de novo": nada é convertido duas vezes.
 * - `onSent` entrega o `uploadId` assim que os dois arquivos terminam de
 *   subir, e `sentUploadId` o recebe de volta: se o que falhou foi só a
 *   confirmação, a nova tentativa só confirma, sem subir de novo nem deixar
 *   40 MB órfãos no bucket. Confirmação **recusada** pelo servidor devolve
 *   `null` em `onSent`: a próxima tentativa começa do envio.
 */
export async function uploadVideo(
  ports: VideoUploadPorts,
  input: {
    file: File;
    planId: string;
    probe: VideoProbe;
    window: TrimWindow;
    signal?: AbortSignal;
    onStage?: (stage: VideoUploadStage) => void;
    /** O vídeo já convertido numa tentativa anterior, do mesmo trecho. */
    reuse?: ProcessedVideo;
    onProcessed?: (processado: ProcessedVideo) => void;
    /** O envio cujos dois arquivos já subiram, numa tentativa anterior. */
    sentUploadId?: string;
    onSent?: (uploadId: string | null) => void;
  },
): Promise<UploadOutcome> {
  const { onStage, signal } = input;
  let processado: ProcessedVideo;

  if (input.reuse) {
    processado = input.reuse;
  } else {
    try {
      processado = await processVideoFile(
        input.file,
        {
          probe: input.probe,
          window: input.window,
          signal,
          onProgress: (fraction) =>
            onStage?.({ stage: "convertendo", fraction }),
        },
        ports.runtime,
      );
    } catch (error) {
      if (error instanceof VideoProcessingError) {
        return { ok: false, error: error.message };
      }
      throw error;
    }

    input.onProcessed?.(processado);
  }

  if (signal?.aborted) throw new VideoProcessingCanceled();

  let uploadId: string;

  if (input.sentUploadId) {
    uploadId = input.sentUploadId;
  } else {
    onStage?.({ stage: "enviando", fraction: 0 });

    const started = await ports.start({
      planId: input.planId,
      purpose: "memory",
      contentType: VIDEO_MIME,
      sizes: {
        full: processado.full.blob.size,
        thumb: processado.thumb.blob.size,
      },
    });

    if (!started.ok) {
      return started;
    }

    /* O pôster sobe **primeiro**. As duas URLs são assinadas juntas e valem
       poucos minutos, e o que conta é o PUT começar dentro do prazo: com o
       vídeo primeiro, 40 MB num sinal fraco levariam mais que o prazo, e o
       pôster começaria com a assinatura já vencida. Pequeno primeiro, os dois
       começam a tempo.

       A barra de envio é por bytes, dos dois somados, e só anda para frente. */
    const total = processado.full.blob.size + processado.thumb.blob.size;
    let jaEnviado = 0;

    for (const [assinada, variante] of [
      [started.data.thumb, processado.thumb],
      [started.data.full, processado.full],
    ] as const) {
      let falha: string | null;

      try {
        falha = await enviar(ports, assinada, variante, DO_VIDEO, {
          signal,
          onProgress: (fraction) =>
            onStage?.({
              stage: "enviando",
              fraction: (jaEnviado + fraction * variante.blob.size) / total,
            }),
        });
      } catch (error) {
        if (signal?.aborted) throw new VideoProcessingCanceled();
        throw error;
      }

      if (falha) {
        return { ok: false, error: falha };
      }

      jaEnviado += variante.blob.size;
    }

    uploadId = started.data.uploadId;
    input.onSent?.(uploadId);
  }

  if (signal?.aborted) throw new VideoProcessingCanceled();

  onStage?.({ stage: "salvando" });

  const confirmada = await ports.confirm({
    planId: input.planId,
    uploadId,
    purpose: "memory",
    kind: "video",
    width: processado.full.width,
    height: processado.full.height,
    durationMs: processado.durationMs,
  });

  if (!confirmada.ok) {
    /* Recusa do servidor não melhora repetindo a mesma confirmação — e, se o
       objeto foi reprovado na conferência, ele já foi apagado. A próxima
       tentativa sobe de novo. Uma confirmação que **lançou** (a rede caiu)
       não passa por aqui: o `uploadId` continua valendo para tentar de novo. */
    input.onSent?.(null);
    return confirmada;
  }

  return { ok: true, mediaId: confirmada.data.mediaId };
}
