import {
  MAX_VIDEO_BYTES,
  MAX_VIDEO_DURATION_MS,
  MAX_VIDEO_INPUT_BYTES,
  MAX_VIDEO_SECONDS,
  MIN_VIDEO_SECONDS,
  VIDEO_MAX_EDGE,
  VIDEO_MIME,
} from "@/features/media/constants";
import {
  scaleToFit,
  type ProcessedVariant,
  type Size,
} from "@/features/media/image/process-image";
import {
  isValidWindow,
  type TrimWindow,
} from "@/features/media/video/trim-window";

/**
 * O vídeo, do arquivo escolhido ao par pronto para o PUT (D-184).
 *
 * É o mesmo contrato da foto (seção 3 do docs/MEDIA_R2.md), pelas mesmas
 * razões, e a primeira pesa mais aqui:
 *
 * 1. **O que sai do celular é reencodado.** Vídeo de celular grava a
 *    coordenada de GPS no contêiner, e uma galeria de dates seria um mapa da
 *    casa do casal. A conversão reescreve o arquivo do zero, sem copiar
 *    metadado nenhum — de novo, não existe etapa separada de limpeza.
 * 2. **O arquivo encolhe.** Um minuto em 4K passa de 300 MB; o trecho
 *    convertido em 720p fica perto de 20 MB, e toca em qualquer navegador — o
 *    HEVC que muito celular grava não toca.
 *
 * A diferença para a foto é que aqui a pessoa escolhe um **trecho** antes, e
 * por isso o fluxo tem duas etapas: abrir (para a tela saber a duração e
 * montar as alças) e converter o trecho escolhido.
 *
 * O módulo é puro em relação ao DOM, como `process-image.ts`: tudo que precisa
 * de navegador entra por `VideoRuntime`. A implementação real está em
 * `browser-video-runtime.ts` e é provada no navegador; aqui se prova a ordem
 * e as recusas.
 */

/** Erro com mensagem escrita para a pessoa, não exceção crua do navegador. */
export class VideoProcessingError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "VideoProcessingError";
  }
}

/** A pessoa fechou a gaveta no meio da conversão. Não é erro a mostrar. */
export class VideoProcessingCanceled extends Error {
  constructor() {
    super("Conversão cancelada.");
    this.name = "VideoProcessingCanceled";
  }
}

/** O que a tela precisa saber do vídeo para montar o corte. */
export type VideoProbe = Size & {
  /** Duração do arquivo original, em segundos. */
  durationSeconds: number;
};

export type TranscodeRequest = {
  window: TrimWindow;
  /** Tamanho de exibição pedido, já reduzido e com lados pares. */
  size: Size;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
};

/** O que a conversão produziu, medido no arquivo de saída. */
export type TranscodedVideo = Size & {
  blob: Blob;
  durationSeconds: number;
};

export type VideoRuntime = {
  probe(file: File): Promise<VideoProbe>;
  transcode(file: File, request: TranscodeRequest): Promise<TranscodedVideo>;
  /** Um quadro do vídeo já convertido, em WebP dentro do teto do `thumb`. */
  poster(video: Blob, signal?: AbortSignal): Promise<ProcessedVariant>;
};

export type ProcessedVideo = {
  full: ProcessedVariant;
  thumb: ProcessedVariant;
  durationMs: number;
};

const VAZIO = "Esse arquivo está vazio.";

const GRANDE_DEMAIS =
  "Esse vídeo é grande demais para ser aberto aqui. Escolha um vídeo mais " +
  "curto ou grave com uma resolução menor.";

const ILEGIVEL =
  "Não deu para ler a duração ou o tamanho desse vídeo. Tente outro, ou grave " +
  "de novo pela câmera do celular.";

const CURTO_DEMAIS =
  "Esse vídeo é curto demais. Ele precisa ter pelo menos um segundo.";

const TRECHO_INVALIDO =
  `O trecho escolhido precisa ter entre ${MIN_VIDEO_SECONDS} e ` +
  `${MAX_VIDEO_SECONDS} segundos. Ajuste as alças e tente de novo.`;

const NAO_COUBE =
  "Mesmo convertido, esse trecho ficou acima do limite de envio. Escolha um " +
  "trecho mais curto.";

const SAIU_LONGO =
  "A conversão produziu um vídeo mais longo que o trecho escolhido. Tente de " +
  "novo.";

const SAIDA_INVALIDA =
  "A conversão terminou sem produzir um vídeo válido. Tente de novo, ou " +
  "escolha outro trecho.";

/** Só valida o que dá para saber sem abrir o arquivo. */
export function assertAcceptableVideoInput(file: File): void {
  if (file.size === 0) {
    throw new VideoProcessingError(VAZIO);
  }

  if (file.size > MAX_VIDEO_INPUT_BYTES) {
    throw new VideoProcessingError(GRANDE_DEMAIS);
  }
}

/**
 * O H.264 trabalha em blocos de 2×2 na cor: lado ímpar ou é recusado pelo
 * encoder ou ganha uma linha verde na borda, conforme o aparelho. Arredonda
 * para baixo, nunca para cima, e nunca abaixo de 2.
 */
export function evenSize(size: Size): Size {
  const par = (lado: number) => Math.max(2, lado - (lado % 2));
  return { width: par(size.width), height: par(size.height) };
}

/** Tamanho de saída: 720p no maior lado, sem nunca ampliar. */
export function targetVideoSize(source: Size): Size {
  return evenSize(scaleToFit(source, VIDEO_MAX_EDGE));
}

/**
 * Abre o vídeo e devolve o que a tela de corte precisa. É a primeira coisa que
 * acontece ao escolher o arquivo, para que um vídeo que este navegador não
 * consegue ler seja recusado **antes** de a pessoa gastar tempo escolhendo o
 * trecho.
 */
export async function inspectVideoFile(
  file: File,
  runtime: VideoRuntime,
): Promise<VideoProbe> {
  assertAcceptableVideoInput(file);

  const probe = await runtime.probe(file);

  /* Duração infinita ou dimensão zerada não montam régua nem conversão: a
     régua teria um fim no infinito, e o tamanho de saída viraria `NaN`. */
  if (
    !Number.isFinite(probe.durationSeconds) ||
    !(probe.width > 0) ||
    !(probe.height > 0)
  ) {
    throw new VideoProcessingError(ILEGIVEL);
  }

  if (probe.durationSeconds < MIN_VIDEO_SECONDS) {
    throw new VideoProcessingError(CURTO_DEMAIS);
  }

  return probe;
}

/**
 * Converte o trecho e gera o pôster. Nenhum acesso a rede: quem sobe é o
 * chamador, como na foto.
 */
export async function processVideoFile(
  file: File,
  input: {
    probe: VideoProbe;
    window: TrimWindow;
    onProgress?: (fraction: number) => void;
    signal?: AbortSignal;
  },
  runtime: VideoRuntime,
): Promise<ProcessedVideo> {
  assertAcceptableVideoInput(file);

  if (!isValidWindow(input.window, input.probe.durationSeconds)) {
    throw new VideoProcessingError(TRECHO_INVALIDO);
  }

  const convertido = await runtime.transcode(file, {
    window: input.window,
    size: targetVideoSize(input.probe),
    onProgress: input.onProgress,
    signal: input.signal,
  });

  if (convertido.blob.size > MAX_VIDEO_BYTES) {
    throw new VideoProcessingError(
      `${NAO_COUBE} (${Math.round(convertido.blob.size / (1024 * 1024))} MB depois de converter)`,
    );
  }

  const durationMs = Math.round(convertido.durationSeconds * 1000);

  /* O que a conversão mediu vai para a confirmação. Um `NaN` ou um zero aqui
     — saída sem pacote, timestamp quebrado — passaria por toda comparação
     abaixo e só seria recusado pelo servidor depois de o vídeo subir inteiro,
     deixando dois órfãos no bucket. Recusar antes de subir custa uma linha. */
  if (
    !Number.isFinite(durationMs) ||
    durationMs <= 0 ||
    !Number.isSafeInteger(convertido.width) ||
    !Number.isSafeInteger(convertido.height) ||
    convertido.width <= 0 ||
    convertido.height <= 0
  ) {
    throw new VideoProcessingError(SAIDA_INVALIDA);
  }

  /* A duração vai para o banco declarada pelo cliente — o servidor não
     decodifica vídeo, como não decodifica foto. O que ele garante é o teto de
     bytes, conferido no R2. Esta guarda é para o defeito nosso, não para um
     cliente adulterado: um corte de 60 s que sai com 90 s é conversão errada,
     e é melhor descobrir aqui do que na galeria. */
  if (durationMs > MAX_VIDEO_DURATION_MS) {
    throw new VideoProcessingError(SAIU_LONGO);
  }

  if (input.signal?.aborted) {
    throw new VideoProcessingCanceled();
  }

  const thumb = await runtime.poster(convertido.blob, input.signal);

  return {
    full: {
      variant: "full",
      blob: convertido.blob,
      mimeType: VIDEO_MIME,
      width: convertido.width,
      height: convertido.height,
    },
    thumb,
    durationMs,
  };
}
