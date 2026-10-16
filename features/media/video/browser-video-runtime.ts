import type {
  AudioCodec,
  Input,
  InputAudioTrack,
  Source,
  VideoCodec,
} from "mediabunny";

import {
  AUDIO_BITRATE,
  VIDEO_BITRATE,
  VIDEO_MIME,
} from "@/features/media/constants";
import {
  browserImageRuntime,
  imageFromCanvas,
} from "@/features/media/image/browser-runtime";
import {
  ImageProcessingError,
  encodeThumbnail,
  type Size,
} from "@/features/media/image/process-image";
import {
  VideoProcessingCanceled,
  VideoProcessingError,
  type TranscodeRequest,
  type TranscodedVideo,
  type VideoProbe,
  type VideoRuntime,
} from "@/features/media/video/process-video";

/**
 * A metade do vídeo que só existe no navegador (D-184). Isolada aqui para
 * `process-video.ts` continuar testável no Node, como a foto.
 *
 * **Mediabunny**, carregada só quando precisa. É TypeScript puro sobre o
 * WebCodecs do navegador: lê o contêiner, decodifica o trecho escolhido com o
 * decodificador de hardware do celular, redimensiona e reencoda — sem
 * WebAssembly, sem `eval` e sem worker, então a CSP não precisou de concessão
 * nova para ela. O `import()` dinâmico a deixa fora do bundle de toda página:
 * só quem escolhe um vídeo a baixa.
 *
 * **Metadado não sai.** A conversão roda com `tags: {}`: sem isso, a
 * biblioteca copia as tags do arquivo de entrada para o de saída por padrão —
 * e é nelas que o celular grava a coordenada de GPS (`©xyz`). Com `copy:
 * false`, nenhum pacote do original é copiado: tudo é decodificado e
 * reencodado, o que também garante a taxa pedida e o fim exato do corte.
 */

type Mediabunny = typeof import("mediabunny");

let carregando: Promise<Mediabunny> | undefined;

function mediabunny(): Promise<Mediabunny> {
  /* Um `import()` que falhou (rede caiu no meio do download do pedaço) não
     pode ficar guardado: a próxima tentativa tem que baixar de novo. */
  carregando ??= import("mediabunny").catch((error: unknown) => {
    carregando = undefined;
    throw error;
  });
  return carregando;
}

/**
 * Os contêineres que um celular grava: MP4 e MOV (o 3GP é da mesma família),
 * e WebM/Matroska de gravador de tela. Lista fechada em vez de `ALL_FORMATS`
 * para não trazer leitor de MP3, WAV e HLS para dentro do pedaço baixado.
 */
function formatos(mb: Mediabunny) {
  return [mb.MP4, mb.QTFF, mb.WEBM, mb.MATROSKA];
}

function abrir(mb: Mediabunny, source: Source): Input {
  return new mb.Input({ formats: formatos(mb), source });
}

/** A causa crua entre parênteses, quando há uma — para quem for diagnosticar. */
function detalheDe(cause: unknown): string {
  if (cause instanceof Error && cause.message) return ` (${cause.message})`;
  if (typeof cause === "string" && cause) return ` (${cause})`;
  return "";
}

function naoAbriu(file: File, cause?: unknown): string {
  const tipo = file.type || "tipo não informado";

  return (
    "Não foi possível abrir esse vídeo neste navegador. O arquivo chegou como " +
    `${tipo}, com ${Math.round(file.size / (1024 * 1024))} MB. Tente outro ` +
    `vídeo, ou grave de novo pela câmera do celular.${detalheDe(cause)}`
  );
}

const SEM_IMAGEM = "Esse arquivo não tem imagem de vídeo, só som.";

/**
 * HEVC é o caso conhecido: Samsung e Xiaomi gravam nele quando a opção de
 * alta eficiência está ligada, e o Chrome só o decodifica onde há hardware que
 * o navegador saiba usar. A mensagem ensina o caminho nos dois aparelhos que
 * usam o DATE, sem afirmar a causa quando o codec é outro.
 */
function naoDecodifica(codec: VideoCodec | null): string {
  if (codec === "hevc") {
    return (
      "Esse vídeo foi gravado em HEVC, e este navegador não consegue abri-lo. " +
      "As próximas gravações saem num formato compatível se você desligar " +
      "“Vídeos de alta eficiência” na câmera (Samsung) ou escolher H.264 em " +
      "“Codificador de vídeo” (Xiaomi)."
    );
  }

  return (
    "Esse vídeo está num formato que este navegador não consegue abrir" +
    `${codec ? ` (${codec})` : ""}. Tente outro vídeo, ou grave de novo pela ` +
    "câmera do celular."
  );
}

const SEM_ENCODER =
  "Este navegador não consegue converter vídeo. Atualize o Chrome e tente de " +
  "novo.";

const SEM_SOM =
  "Este navegador não consegue converter o som desse vídeo. Atualize o " +
  "Chrome e tente de novo.";

const FALHOU = "A conversão do vídeo falhou no meio do caminho. Tente de novo.";

const SEM_QUADRO = "Não foi possível tirar a capa do vídeo convertido.";

async function probe(file: File): Promise<VideoProbe> {
  const mb = await mediabunny();
  const input = abrir(mb, new mb.BlobSource(file));

  try {
    let legivel = false;
    try {
      legivel = await input.canRead();
    } catch {
      legivel = false;
    }

    if (!legivel) {
      throw new VideoProcessingError(naoAbriu(file));
    }

    const trilha = await input.getPrimaryVideoTrack();
    if (!trilha) {
      throw new VideoProcessingError(SEM_IMAGEM);
    }

    if (!(await trilha.canDecode())) {
      throw new VideoProcessingError(naoDecodifica(await trilha.getCodec()));
    }

    const [durationSeconds, width, height] = await Promise.all([
      input.computeDuration(),
      trilha.getDisplayWidth(),
      trilha.getDisplayHeight(),
    ]);

    return { durationSeconds, width, height };
  } catch (cause) {
    if (cause instanceof VideoProcessingError) throw cause;
    throw new VideoProcessingError(naoAbriu(file, cause), { cause });
  } finally {
    input.dispose();
  }
}

/**
 * H.264 primeiro: é o que toca em todo navegador e o que todo celular codifica
 * em hardware. VP9 e AV1 são o resgate, e o MP4 aceita os dois — o Chrome do
 * Android toca qualquer um deles.
 */
const VIDEO_PREFERIDOS: readonly VideoCodec[] = ["avc", "vp9", "av1"];

async function escolherVideo(
  mb: Mediabunny,
  size: Size,
): Promise<VideoCodec | null> {
  for (const codec of VIDEO_PREFERIDOS) {
    const ok = await mb.canEncodeVideo(codec, {
      width: size.width,
      height: size.height,
      quality: new mb.Quality({ bitrate: VIDEO_BITRATE }),
    });
    if (ok) return codec;
  }
  return null;
}

type EscolhaDeAudio =
  { codec: AudioCodec; sampleRate?: number } | { codec: null };

/**
 * AAC primeiro, pelo mesmo motivo do H.264. Opus é o resgate e o Chrome sempre
 * o tem — mas só codifica a 48 kHz, então o resgate força a taxa.
 */
async function escolherAudio(
  mb: Mediabunny,
  trilha: InputAudioTrack,
): Promise<EscolhaDeAudio> {
  const [numberOfChannels, sampleRate] = await Promise.all([
    trilha.getNumberOfChannels(),
    trilha.getSampleRate(),
  ]);
  const quality = new mb.Quality({ bitrate: AUDIO_BITRATE });

  if (
    await mb.canEncodeAudio("aac", { numberOfChannels, sampleRate, quality })
  ) {
    return { codec: "aac" };
  }

  if (
    await mb.canEncodeAudio("opus", {
      numberOfChannels,
      sampleRate: 48_000,
      quality,
    })
  ) {
    return { codec: "opus", sampleRate: 48_000 };
  }

  return { codec: null };
}

async function medir(
  mb: Mediabunny,
  buffer: ArrayBuffer,
): Promise<Size & { durationSeconds: number }> {
  const saida = abrir(mb, new mb.BufferSource(buffer));

  try {
    const trilha = await saida.getPrimaryVideoTrack();
    if (!trilha) {
      throw new VideoProcessingError(FALHOU);
    }

    const [width, height, durationSeconds] = await Promise.all([
      trilha.getDisplayWidth(),
      trilha.getDisplayHeight(),
      saida.computeDuration(),
    ]);

    return { width, height, durationSeconds };
  } finally {
    saida.dispose();
  }
}

async function transcode(
  file: File,
  { window, size, onProgress, signal }: TranscodeRequest,
): Promise<TranscodedVideo> {
  if (signal?.aborted) throw new VideoProcessingCanceled();

  const mb = await mediabunny();
  const input = abrir(mb, new mb.BlobSource(file));
  const target = new mb.BufferTarget();
  const output = new mb.Output({
    /* `in-memory` põe o índice (`moov`) no começo do arquivo. Sem isso ele
       fica no fim, e o `<video>` precisaria baixar o vídeo inteiro antes do
       primeiro quadro — com a leitura em pedaços da rota, seria o pedido de
       todos os pedaços antes de tocar. */
    format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }),
    target,
  });

  let conversao: Awaited<ReturnType<typeof mb.Conversion.init>> | undefined;
  const cancelar = () => void conversao?.cancel();

  try {
    const codecVideo = await escolherVideo(mb, size);
    if (!codecVideo) {
      throw new VideoProcessingError(SEM_ENCODER);
    }

    const trilhaDeAudio = await input.getPrimaryAudioTrack();
    const audio = trilhaDeAudio
      ? await escolherAudio(mb, trilhaDeAudio)
      : ({ codec: null } as const);

    if (trilhaDeAudio && audio.codec === null) {
      throw new VideoProcessingError(SEM_SOM);
    }

    conversao = await mb.Conversion.init({
      input,
      output,
      tracks: "primary",
      trim: { start: window.start, end: window.end },
      copy: false,
      tags: {},
      showWarnings: false,
      video: {
        width: size.width,
        height: size.height,
        /* Os dois lados já saem na proporção do original, arredondados para
           par. `fill` absorve o meio pixel do arredondamento; `contain` o
           transformaria numa linha preta na borda. */
        fit: "fill",
        codec: codecVideo,
        quality: new mb.Quality({ bitrate: VIDEO_BITRATE }),
        // Arrastar no player cai num quadro-chave a no máximo 2 s de distância.
        keyFrameInterval: 2,
      },
      audio:
        audio.codec === null
          ? { discard: true }
          : {
              codec: audio.codec,
              quality: new mb.Quality({ bitrate: AUDIO_BITRATE }),
              ...(audio.sampleRate ? { sampleRate: audio.sampleRate } : {}),
            },
    });

    /* Trilha descartada não impede a conversão de rodar: a biblioteca segue
       com o que sobrou. Um vídeo sem a imagem ou sem o som que a pessoa gravou
       não é o vídeo dela, então descarte que não foi pedido vira recusa. */
    for (const { track, reason } of conversao.discardedTracks) {
      if (reason === "discarded_by_user") continue;

      if (track.isVideoTrack()) {
        throw new VideoProcessingError(
          reason === "no_encodable_target_codec"
            ? SEM_ENCODER
            : naoDecodifica(await track.getCodec()),
        );
      }

      if (track.isAudioTrack()) {
        throw new VideoProcessingError(SEM_SOM);
      }
    }

    if (!conversao.isValid) {
      throw new VideoProcessingError(FALHOU);
    }

    if (onProgress) {
      conversao.onProgress = (fracao) => onProgress(fracao);
    }

    signal?.addEventListener("abort", cancelar, { once: true });
    if (signal?.aborted) throw new VideoProcessingCanceled();

    await conversao.execute();

    const buffer = target.buffer;
    if (!buffer) {
      throw new VideoProcessingError(FALHOU);
    }

    const medido = await medir(mb, buffer);

    return {
      blob: new Blob([buffer], { type: VIDEO_MIME }),
      ...medido,
    };
  } catch (cause) {
    if (cause instanceof VideoProcessingError) throw cause;
    if (cause instanceof VideoProcessingCanceled) throw cause;
    if (cause instanceof mb.ConversionCanceledError || signal?.aborted) {
      throw new VideoProcessingCanceled();
    }
    throw new VideoProcessingError(`${FALHOU}${detalheDe(cause)}`, { cause });
  } finally {
    signal?.removeEventListener("abort", cancelar);

    /* Conversão que não terminou ainda segura decodificador e encoder. No
       Android eles são de hardware e poucos: sem soltar aqui, o "Tentar de
       novo" logo depois de uma falha pode não conseguir decodificador até o
       coletor de lixo passar. */
    if (
      conversao &&
      conversao.state !== "done" &&
      conversao.state !== "canceled"
    ) {
      await conversao.cancel().catch(() => {});
    }

    input.dispose();
  }
}

/**
 * O pôster é o primeiro quadro do vídeo **convertido**, não do original: é o
 * quadro que abre o trecho que a pessoa escolheu, já na orientação certa — a
 * biblioteca aplica a rotação gravada no contêiner ao desenhar no canvas.
 */
async function poster(video: Blob, signal?: AbortSignal) {
  if (signal?.aborted) throw new VideoProcessingCanceled();

  const mb = await mediabunny();
  const input = abrir(mb, new mb.BlobSource(video));

  try {
    const trilha = await input.getPrimaryVideoTrack();
    if (!trilha) {
      throw new VideoProcessingError(SEM_QUADRO);
    }

    const sink = new mb.CanvasSink(trilha);
    const quadro = await sink.getCanvas(await trilha.getFirstTimestamp());

    if (!quadro) {
      throw new VideoProcessingError(SEM_QUADRO);
    }

    return await encodeThumbnail(
      browserImageRuntime,
      imageFromCanvas(quadro.canvas),
    );
  } catch (cause) {
    if (cause instanceof VideoProcessingError) throw cause;
    if (cause instanceof ImageProcessingError) {
      throw new VideoProcessingError(cause.message, { cause });
    }
    throw new VideoProcessingError(`${SEM_QUADRO}${detalheDe(cause)}`, {
      cause,
    });
  } finally {
    input.dispose();
  }
}

export const browserVideoRuntime: VideoRuntime = { probe, transcode, poster };
