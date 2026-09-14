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

/** MIME aceito pelo servidor na assinatura do PUT. Nada além destes três. */
export const ALLOWED_UPLOAD_MIME = [
  "image/webp",
  "image/jpeg",
  "image/png",
] as const;

export type AllowedUploadMime = (typeof ALLOWED_UPLOAD_MIME)[number];

export function isAllowedUploadMime(
  value: unknown,
): value is AllowedUploadMime {
  return (ALLOWED_UPLOAD_MIME as readonly unknown[]).includes(value);
}

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

/** Expiração da URL assinada. Minutos, nunca horas (seção 5 do documento). */
export const SIGNED_URL_TTL_SECONDS = 5 * 60;
