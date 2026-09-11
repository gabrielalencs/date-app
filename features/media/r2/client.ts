import "server-only";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import {
  MAX_BYTES,
  SIGNED_URL_TTL_SECONDS,
  isAllowedUploadMime,
  type AllowedUploadMime,
  type MediaVariant,
} from "@/features/media/constants";
import {
  resolveR2,
  type R2Config,
  type R2Target,
} from "@/features/media/r2/env";

/**
 * Acesso ao R2. Server-only: o browser nunca importa este módulo e nunca
 * conhece o host do bucket, salvo pela URL assinada de upload (seção 6 do
 * docs/MEDIA_R2.md, D-052).
 *
 * O que a versão instalada do SDK assina, verificado em @aws-sdk/client-s3
 * 3.1129.0 com @aws-sdk/s3-request-presigner 3.1129.0:
 *
 * - `content-type` NÃO é assinado por padrão. O `prepareRequest` do
 *   S3RequestPresigner faz `unsignableHeaders.add("content-type")`, e um
 *   `PutObjectCommand({ ContentType })` sozinho produz
 *   `X-Amz-SignedHeaders=host`. Para fixar o tipo é obrigatório passar
 *   `signableHeaders: new Set(["content-type"])`.
 * - `content-length` É assinado quando `ContentLength` vai no comando: o
 *   header não está na lista de sempre-não-assináveis do @smithy/signature-v4,
 *   e o resultado é `X-Amz-SignedHeaders=content-length;host`.
 *
 * Consequência: a URL assinada vale para um método, uma chave, um content-type
 * e um número exato de bytes. Não é um teto, é igualdade — o browser envia o
 * blob que já mediu, e qualquer outro tamanho quebra a assinatura no R2.
 */

let cached:
  { config: R2Config; target: R2Target; client: S3Client } | undefined;

function r2() {
  if (!cached) {
    // A guarda de branch/bucket roda aqui, antes de existir cliente.
    const { config, target } = resolveR2(process.env);

    cached = {
      config,
      target,
      client: new S3Client({
        region: "auto",
        endpoint: config.endpoint,
        /* Sem isto o SDK usa virtual-hosted style e o host vira
           `date-media-dev.<conta>.r2.cloudflarestorage.com`. O R2 aceita os
           dois, mas com path-style o host assinado é literalmente o endpoint
           que a guarda imprime — o que se confere a olho é o que é contatado. */
        forcePathStyle: true,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
      }),
    };
  }

  return cached;
}

/** Bucket e endpoint, para log e para o script de conferência. Sem credencial. */
export function r2Target(): R2Target {
  return r2().target;
}

export class R2Error extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "R2Error";
  }
}

export type SignedUpload = {
  url: string;
  /** O cliente precisa mandar exatamente estes dois, ou a assinatura quebra. */
  contentType: AllowedUploadMime;
  contentLength: number;
  expiresInSeconds: number;
};

export async function signUpload(input: {
  objectKey: string;
  variant: MediaVariant;
  contentType: string;
  contentLength: number;
}): Promise<SignedUpload> {
  if (!isAllowedUploadMime(input.contentType)) {
    throw new R2Error("Tipo de imagem não permitido.");
  }

  const teto = MAX_BYTES[input.variant];
  if (
    !Number.isSafeInteger(input.contentLength) ||
    input.contentLength <= 0 ||
    input.contentLength > teto
  ) {
    throw new R2Error(
      `Tamanho declarado fora do permitido para ${input.variant}.`,
    );
  }

  const { client, config } = r2();

  const url = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: input.objectKey,
      ContentType: input.contentType,
      ContentLength: input.contentLength,
    }),
    {
      expiresIn: SIGNED_URL_TTL_SECONDS,
      // Sem isto o content-type sai da assinatura e o cliente sobe o que quiser.
      signableHeaders: new Set(["content-type", "content-length"]),
    },
  );

  return {
    url,
    contentType: input.contentType,
    contentLength: input.contentLength,
    expiresInSeconds: SIGNED_URL_TTL_SECONDS,
  };
}

export type ObjectFacts = {
  sizeBytes: number;
  contentType: string;
};

/**
 * O que o R2 reporta, que é o que vai para o banco. O cliente declara para a
 * assinatura; ele não é fonte da verdade sobre o que subiu.
 * Devolve `null` quando o objeto não existe.
 */
export async function headObject(
  objectKey: string,
): Promise<ObjectFacts | null> {
  const { client, config } = r2();

  try {
    const head = await client.send(
      new HeadObjectCommand({ Bucket: config.bucket, Key: objectKey }),
    );

    if (typeof head.ContentLength !== "number") {
      throw new R2Error("O R2 não informou o tamanho do objeto.");
    }

    return {
      sizeBytes: head.ContentLength,
      contentType: head.ContentType ?? "application/octet-stream",
    };
  } catch (error) {
    if (error instanceof NotFound) {
      return null;
    }
    if (isNotFoundStatus(error)) {
      return null;
    }
    throw new R2Error("Falha ao conferir o objeto no R2.", { cause: error });
  }
}

function isNotFoundStatus(error: unknown): boolean {
  const status = (error as { $metadata?: { httpStatusCode?: number } } | null)
    ?.$metadata?.httpStatusCode;
  return status === 404;
}

export type ObjectBody = {
  body: ReadableStream<Uint8Array>;
  contentType: string;
  sizeBytes: number | undefined;
};

/** Lê os bytes para a rota `/api/media/[id]` devolver. */
export async function getObject(objectKey: string): Promise<ObjectBody | null> {
  const { client, config } = r2();

  try {
    const object = await client.send(
      new GetObjectCommand({ Bucket: config.bucket, Key: objectKey }),
    );

    if (!object.Body) {
      return null;
    }

    return {
      body: object.Body.transformToWebStream(),
      contentType: object.ContentType ?? "application/octet-stream",
      sizeBytes:
        typeof object.ContentLength === "number"
          ? object.ContentLength
          : undefined,
    };
  } catch (error) {
    if (error instanceof NotFound || isNotFoundStatus(error)) {
      return null;
    }
    throw new R2Error("Falha ao ler o objeto no R2.", { cause: error });
  }
}

/**
 * Chamado depois de a linha já ter sido apagada. Falha aqui deixa um objeto
 * órfão, que custa kilobytes; a ordem inversa deixaria imagem quebrada na tela
 * (D-053). Por isso não relança: quem chama já cumpriu a parte que importa.
 */
export async function deleteObjects(objectKeys: readonly string[]): Promise<{
  removidos: number;
  orfaos: string[];
}> {
  const { client, config } = r2();
  const orfaos: string[] = [];
  let removidos = 0;

  for (const Key of objectKeys) {
    try {
      await client.send(
        new DeleteObjectCommand({ Bucket: config.bucket, Key }),
      );
      removidos += 1;
    } catch {
      orfaos.push(Key);
    }
  }

  return { removidos, orfaos };
}
