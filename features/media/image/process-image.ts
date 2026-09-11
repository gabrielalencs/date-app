import {
  MAX_BYTES,
  MAX_EDGE,
  MAX_INPUT_BYTES,
  OUTPUT_MIME,
  QUALITY_LADDER,
  type MediaVariant,
} from "@/features/media/constants";

/**
 * Reprocessamento da imagem no browser, antes de qualquer byte sair da máquina
 * (seção 3 do docs/MEDIA_R2.md, D-051).
 *
 * Duas razões, nesta ordem:
 *
 * 1. Reencodar descarta o EXIF por construção. Foto de celular carrega
 *    coordenada de GPS, e um álbum de dates seria um mapa da casa do casal.
 *    Não existe etapa separada de limpeza de metadado, porque etapa separada
 *    é etapa que alguém esquece.
 * 2. Foto de celular tem 3 a 8 MB. Duas saídas de 2000px e 640px em WebP
 *    cabem no teto da assinatura e tornam a grade viável no celular.
 *
 * O servidor não processa imagem: `sharp` continua desligado no
 * `pnpm-workspace.yaml`.
 *
 * O módulo é puro em relação ao DOM: as operações de browser entram por
 * `ImageRuntime`, o que deixa a orquestração testável no Node e a decodificação
 * real para a verificação em navegador.
 */

/** Erro com mensagem escrita para a pessoa, não exceção crua do browser. */
export class ImageProcessingError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ImageProcessingError";
  }
}

export type Size = { width: number; height: number };

export type DecodedImage = Size & {
  /** Libera o bitmap. Chamado sempre, inclusive quando o encode falha. */
  close(): void;
};

export type EncodeRequest = {
  variant: MediaVariant;
  size: Size;
  quality: number;
};

export type ImageRuntime<TImage extends DecodedImage = DecodedImage> = {
  decode(file: File): Promise<TImage>;
  encode(image: TImage, request: EncodeRequest): Promise<Blob>;
};

export type ProcessedVariant = Size & {
  variant: MediaVariant;
  blob: Blob;
  mimeType: string;
};

export type ProcessedImage = {
  full: ProcessedVariant;
  thumb: ProcessedVariant;
  /** Dimensões da foto original, só para diagnóstico. Não vai para o banco. */
  source: Size;
};

const NAO_DECODIFICOU =
  "Não foi possível abrir essa imagem. Se ela veio de um iPhone, ela pode " +
  "estar em HEIC, que este navegador não lê. Abra a foto, exporte como JPEG " +
  "e tente de novo.";

const NAO_E_IMAGEM =
  "Esse arquivo não é uma imagem. Escolha um JPEG, um PNG ou um WebP.";

const GRANDE_DEMAIS =
  "Essa imagem é grande demais para ser processada aqui. Reduza a resolução " +
  "no celular e tente de novo.";

const NAO_COUBE =
  "Mesmo reduzida, essa imagem ficou acima do limite de envio. Corte um " +
  "pedaço ou escolha outra foto.";

const SEM_PIXEL = "Essa imagem não tem conteúdo visível.";

/**
 * Reduz preservando proporção, nunca amplia. Uma foto de 800px continua com
 * 800px: reamostrar para cima só inventaria pixel e engordaria o arquivo.
 */
export function scaleToFit(source: Size, maxEdge: number): Size {
  const maiorLado = Math.max(source.width, source.height);

  if (maiorLado <= maxEdge) {
    return { width: source.width, height: source.height };
  }

  const fator = maxEdge / maiorLado;
  return {
    width: Math.max(1, Math.round(source.width * fator)),
    height: Math.max(1, Math.round(source.height * fator)),
  };
}

/** Só valida o que dá para saber sem decodificar. */
export function assertAcceptableInput(file: File): void {
  if (file.size === 0) {
    throw new ImageProcessingError(SEM_PIXEL);
  }

  if (file.size > MAX_INPUT_BYTES) {
    throw new ImageProcessingError(GRANDE_DEMAIS);
  }

  /* O tipo vazio acontece em arquivo vindo de share sheet; nesse caso deixa
     passar e quem decide é o decodificador, que é a autoridade real. */
  if (file.type !== "" && !file.type.startsWith("image/")) {
    throw new ImageProcessingError(NAO_E_IMAGEM);
  }
}

async function encodeWithinCap<TImage extends DecodedImage>(
  runtime: ImageRuntime<TImage>,
  image: TImage,
  variant: MediaVariant,
  size: Size,
): Promise<ProcessedVariant> {
  let ultimo: Blob | undefined;

  for (const quality of QUALITY_LADDER) {
    const blob = await runtime.encode(image, { variant, size, quality });
    ultimo = blob;

    if (blob.size <= MAX_BYTES[variant]) {
      return { variant, blob, mimeType: OUTPUT_MIME, ...size };
    }
  }

  /* Três degraus e para. Reencodar até caber é loop disfarçado, e uma foto que
     não cabe a 0.58 tem um problema que qualidade não resolve. */
  throw new ImageProcessingError(
    `${NAO_COUBE} (${Math.round((ultimo?.size ?? 0) / 1024)} KB depois de reduzir)`,
  );
}

/**
 * Recebe o `File` do input e devolve as duas saídas prontas para o PUT.
 * Nenhum acesso a rede: quem sobe é o chamador.
 */
export async function processImageFile<TImage extends DecodedImage>(
  file: File,
  runtime: ImageRuntime<TImage>,
): Promise<ProcessedImage> {
  assertAcceptableInput(file);

  let image: TImage;
  try {
    image = await runtime.decode(file);
  } catch (cause) {
    throw new ImageProcessingError(NAO_DECODIFICOU, { cause });
  }

  try {
    if (image.width < 1 || image.height < 1) {
      throw new ImageProcessingError(SEM_PIXEL);
    }

    const source: Size = { width: image.width, height: image.height };

    const full = await encodeWithinCap(
      runtime,
      image,
      "full",
      scaleToFit(source, MAX_EDGE.full),
    );
    const thumb = await encodeWithinCap(
      runtime,
      image,
      "thumb",
      scaleToFit(source, MAX_EDGE.thumb),
    );

    return { full, thumb, source };
  } finally {
    image.close();
  }
}
