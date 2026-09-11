import type { AllowedUploadMime } from "@/features/media/constants";

/**
 * O contrato entre o browser e o servidor no upload.
 *
 * Mora fora de `data/` e fora de `r2/` porque os dois lados precisam dele, e
 * porque aqueles dois módulos são `server-only`: um `import type` de lá até
 * seria apagado na compilação, mas deixaria o cliente formalmente dependente
 * da camada de dados, e é isso que se quer impedir.
 */
export type SignedUpload = {
  url: string;
  /** O browser precisa mandar exatamente estes dois, ou a assinatura quebra. */
  contentType: AllowedUploadMime;
  contentLength: number;
  expiresInSeconds: number;
};

export type StartedUpload = {
  /** Opaco para o cliente: ele devolve isto na confirmação e nada mais. */
  uploadId: string;
  full: SignedUpload;
  thumb: SignedUpload;
};

/** Resultado de toda Server Action de mídia. */
export type MediaResult<T = undefined> =
  { ok: true; data: T } | { ok: false; error: string };
