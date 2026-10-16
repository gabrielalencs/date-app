/**
 * Constantes compartilhadas entre o processamento no browser e a validação no
 * servidor. Nenhum segredo, nenhum acesso a banco: este módulo é importável
 * dos dois lados de propósito, para que os tetos não divirjam.
 *
 * Seções 3, 5 e 9 do docs/MEDIA_R2.md.
 */

/** Duas saídas por foto. `full` é a imagem; `thumb` é a miniatura da grade. */
export const MEDIA_VARIANTS = ["full", "thumb"] as const;

export type MediaVariant = (typeof MEDIA_VARIANTS)[number];

export function isMediaVariant(value: unknown): value is MediaVariant {
  return (MEDIA_VARIANTS as readonly unknown[]).includes(value);
}

/**
 * `gallery` é antes, `memory` é depois (D-104).
 *
 * `cover` é a capa do plano; `gallery` é inspiração — o print do restaurante,
 * a referência que fez vocês quererem ir; `memory` é o que vocês fotografaram
 * lá. Mesma tabela, mesmo fluxo de upload assinado, mesma rota autenticada de
 * leitura, mesmo reprocessamento no cliente que descarta EXIF. O que muda é o
 * `purpose` e onde a grade aparece.
 *
 * `avatar` continua no enum do banco e continua sem uso. Estar no enum não é
 * motivo para implementar.
 */
export const UPLOADABLE_PURPOSES = ["cover", "gallery", "memory"] as const;

export type UploadablePurpose = (typeof UPLOADABLE_PURPOSES)[number];

export function isUploadablePurpose(
  value: unknown,
): value is UploadablePurpose {
  return (UPLOADABLE_PURPOSES as readonly unknown[]).includes(value);
}

/**
 * Vídeo só entra pela Galeria, que grava `memory` (D-184). A capa é sempre
 * foto: ela é desenhada com `<img>` no topo do plano, no card das ideias, no
 * card das memórias, no painel da agenda e no próximo date da Home — um MP4
 * ali seria imagem quebrada em cinco telas.
 */
export function acceptsVideo(purpose: UploadablePurpose): boolean {
  return purpose === "memory";
}

/** Maior lado, em pixels, de cada saída. */
export const MAX_EDGE: Readonly<Record<MediaVariant, number>> = {
  full: 2000,
  thumb: 640,
};

/**
 * Teto declarado na assinatura e conferido de novo contra o que o R2 reporta.
 * O cliente sempre entrega WebP; jpeg e png ficam permitidos porque a
 * assinatura fixa o content-type e um cliente futuro pode legitimamente
 * mandar um dos dois.
 */
export const MAX_BYTES: Readonly<Record<MediaVariant, number>> = {
  full: 2 * 1024 * 1024,
  thumb: 400 * 1024,
};

/** MIME de imagem aceito na assinatura do PUT. Nada além destes três. */
export const ALLOWED_IMAGE_MIME = [
  "image/webp",
  "image/jpeg",
  "image/png",
] as const;

/**
 * O único MIME de vídeo (D-184). O aparelho sempre entrega MP4 com H.264 e
 * AAC — ou o par que o navegador conseguir codificar —, então não existe
 * `video/quicktime` nem `video/webm` a aceitar: o que sai do celular é sempre
 * o mesmo contêiner, seja qual for o que entrou.
 */
export const VIDEO_MIME = "video/mp4";

/** MIME aceito pelo servidor na assinatura do PUT. */
export const ALLOWED_UPLOAD_MIME = [...ALLOWED_IMAGE_MIME, VIDEO_MIME] as const;

export type AllowedUploadMime = (typeof ALLOWED_UPLOAD_MIME)[number];

export function isAllowedUploadMime(
  value: unknown,
): value is AllowedUploadMime {
  return (ALLOWED_UPLOAD_MIME as readonly unknown[]).includes(value);
}

export function isVideoMime(value: unknown): value is typeof VIDEO_MIME {
  return value === VIDEO_MIME;
}

export function isImageMime(
  value: unknown,
): value is (typeof ALLOWED_IMAGE_MIME)[number] {
  return (ALLOWED_IMAGE_MIME as readonly unknown[]).includes(value);
}

/** Foto ou vídeo. Decidido pelo MIME, que o servidor fixa na assinatura. */
export type MediaKind = "image" | "video";

export function mediaKindOf(mimeType: string): MediaKind {
  return isVideoMime(mimeType) ? "video" : "image";
}

/**
 * MIME aceito para uma variante. O `thumb` é sempre imagem — num vídeo, é o
 * pôster, um quadro do próprio trecho reencodado em WebP. Um `thumb` de vídeo
 * quebraria toda grade e todo card que o desenham com `<img>`.
 */
export function isAllowedForVariant(
  variant: MediaVariant,
  mimeType: unknown,
): mimeType is AllowedUploadMime {
  return variant === "thumb"
    ? isImageMime(mimeType)
    : isAllowedUploadMime(mimeType);
}

/**
 * Duração máxima de um vídeo, em segundos (D-184). O teto que protege o
 * bucket é o de bytes, logo abaixo; este é o que a pessoa vê na hora de
 * cortar, e é dele que o teto de bytes deriva.
 */
export const MAX_VIDEO_SECONDS = 60;

/** Trecho mais curto que se aceita. Menos que isso é toque acidental. */
export const MIN_VIDEO_SECONDS = 1;

/**
 * Folga sobre a duração declarada. O trecho escolhido tem no máximo 60 s,
 * mas o último quadro tem duração própria e o encoder arredonda o fim para o
 * quadro inteiro: um corte de exatos 60 s sai com 60,03 s. Um segundo de folga
 * absorve isso sem abrir espaço para um vídeo de verdade mais longo.
 */
export const VIDEO_DURATION_TOLERANCE_MS = 1_000;

/**
 * O teto da duração declarada, em milissegundos. Um número só, usado pela
 * guarda do aparelho, pelo Zod da action e pela camada de dados: se os três
 * divergissem, um trecho passaria no celular e só seria recusado depois de
 * subir inteiro.
 */
export const MAX_VIDEO_DURATION_MS =
  MAX_VIDEO_SECONDS * 1000 + VIDEO_DURATION_TOLERANCE_MS;

/** Maior lado do vídeo, em pixels: 720p (D-184). */
export const VIDEO_MAX_EDGE = 1280;

/** Taxa de vídeo pedida ao encoder, em bits por segundo. */
export const VIDEO_BITRATE = 2_500_000;

/** Taxa de áudio pedida ao encoder, em bits por segundo. */
export const AUDIO_BITRATE = 128_000;

/**
 * Teto do arquivo de vídeo. 60 s a 2,5 Mbit/s mais 128 kbit/s de áudio dão
 * cerca de 20 MB; o dobro cobre o encoder de hardware do celular estourando a
 * taxa pedida numa cena de muito movimento, que é o que encoder de taxa
 * variável faz. Acima disso alguma coisa está errada, e o servidor recusa.
 */
export const MAX_VIDEO_BYTES = 40 * 1024 * 1024;

/** O teto de uma variante, conforme o que ela é. */
export function maxBytesFor(variant: MediaVariant, mimeType: string): number {
  return variant === "full" && isVideoMime(mimeType)
    ? MAX_VIDEO_BYTES
    : MAX_BYTES[variant];
}

/**
 * Maior resposta da rota de leitura a um pedido com Range. Uma função da
 * Vercel tem teto de corpo de resposta de 4,5 MB; servir o vídeo em pedaços de
 * 4 MB mantém cada resposta abaixo dele sem depender de a resposta em stream
 * escapar do limite. O `<video>` pede o resto sozinho, pedaço a pedaço.
 */
export const MAX_RANGE_RESPONSE_BYTES = 4 * 1024 * 1024;

/** O que o browser produz, sempre. */
export const OUTPUT_MIME = "image/webp" satisfies AllowedUploadMime;

/** Qualidade do reencode. "Em torno de 0.82" — a escada de queda está abaixo. */
export const OUTPUT_QUALITY = 0.82;

/**
 * Se a 0.82 o `full` estourar o teto, cai um degrau em vez de recusar uma foto
 * legítima. Três tentativas e para: reencodar sem limite é loop disfarçado.
 */
export const QUALITY_LADDER = [OUTPUT_QUALITY, 0.7, 0.58] as const;

/**
 * Recusa antes de decodificar. Não é o teto de saída: é o teto de entrada, e
 * existe para não gastar memória do celular decodificando um arquivo absurdo.
 */
export const MAX_INPUT_BYTES = 40 * 1024 * 1024;

/**
 * O teto de entrada do vídeo é outro, e bem maior: o vídeo não é lido inteiro
 * para a memória — a biblioteca lê o arquivo em pedaços, e só o trecho
 * escolhido é decodificado. Dez minutos em 4K passam de 3 GB; o teto existe
 * para um arquivo absurdo ser recusado com uma frase, não com o navegador
 * travando.
 */
export const MAX_VIDEO_INPUT_BYTES = 8 * 1024 * 1024 * 1024;

/** Expiração da URL assinada. Minutos, nunca horas (seção 5 do documento). */
export const SIGNED_URL_TTL_SECONDS = 5 * 60;
