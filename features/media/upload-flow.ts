import type { UploadablePurpose } from "@/features/media/constants";
import {
  ImageProcessingError,
  processImageFile,
  type ImageRuntime,
  type ProcessedImage,
  type ProcessedVariant,
} from "@/features/media/image/process-image";
import type { StartedUpload } from "@/features/media/contract";

/**
 * O fluxo de upload, sem React e sem `window`, para ser testável de ponta a
 * ponta com dublês (seção 2 do docs/MEDIA_R2.md):
 *
 *   processa → pede assinatura → PUT direto no R2 → confirma no servidor
 *
 * O servidor é quem gera a object key e quem confirma; aqui só se conduz a
 * ordem. Nada nesta função conhece o host do R2 além da URL que o servidor
 * devolveu assinada.
 */
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
  }): Promise<
    { ok: true; data: { mediaId: string } } | { ok: false; error: string }
  >;
  put(
    url: string,
    body: Blob,
    contentType: string,
  ): Promise<{ status: number }>;
};

export type UploadOutcome =
  { ok: true; mediaId: string } | { ok: false; error: string };

const FALHOU_O_ENVIO =
  "O envio da imagem falhou no meio do caminho. Tente de novo.";

const EXPIROU =
  "A permissão de envio expirou antes de a imagem subir. Tente de novo.";

async function enviar(
  ports: UploadPorts,
  assinada: { url: string; contentType: string },
  variante: ProcessedVariant,
): Promise<string | null> {
  const { status } = await ports.put(
    assinada.url,
    variante.blob,
    assinada.contentType,
  );

  if (status === 200 || status === 201) {
    return null;
  }

  /* 403 aqui é assinatura: expirou, ou o corpo não bate com o tamanho e o
     tipo que foram assinados. Não é permissão da pessoa. */
  return status === 403 ? EXPIROU : FALHOU_O_ENVIO;
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
    const falha = await enviar(ports, assinada, variante);
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
