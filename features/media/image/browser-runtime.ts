import { OUTPUT_MIME, type MediaVariant } from "@/features/media/constants";
import {
  ImageProcessingError,
  type DecodedImage,
  type EncodeRequest,
  type ImageRuntime,
} from "@/features/media/image/process-image";

/**
 * A metade que só existe no browser. Isolada aqui para que `process-image.ts`
 * continue testável no Node.
 */

type BitmapImage = DecodedImage & { bitmap: ImageBitmap };

const SEM_WEBP =
  "Este navegador não conseguiu gerar a imagem no formato usado pelo DATE. " +
  "Atualize o navegador e tente de novo.";

const SEM_CANVAS =
  "Este navegador não conseguiu preparar a imagem para envio. Atualize o " +
  "navegador e tente de novo.";

async function decode(file: File): Promise<BitmapImage> {
  /* `from-image` aplica a orientação do EXIF ao bitmap. Como o reencode vai
     descartar o EXIF, sem isto a foto tirada de lado subiria deitada — o giro
     estaria só no metadado que estamos jogando fora. */
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });

  return {
    bitmap,
    width: bitmap.width,
    height: bitmap.height,
    close: () => bitmap.close(),
  };
}

type Target = {
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  toBlob(quality: number): Promise<Blob>;
};

function createTarget(width: number, height: number): Target {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");

    if (!context) {
      throw new ImageProcessingError(SEM_CANVAS);
    }

    return {
      context,
      toBlob: (quality) => canvas.convertToBlob({ type: OUTPUT_MIME, quality }),
    };
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new ImageProcessingError(SEM_CANVAS);
  }

  return {
    context,
    toBlob: (quality) =>
      new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) =>
            blob ? resolve(blob) : reject(new ImageProcessingError(SEM_WEBP)),
          OUTPUT_MIME,
          quality,
        );
      }),
  };
}

async function encode(
  image: BitmapImage,
  { size, quality }: EncodeRequest,
): Promise<Blob> {
  const target = createTarget(size.width, size.height);

  target.context.imageSmoothingEnabled = true;
  target.context.imageSmoothingQuality = "high";
  target.context.drawImage(image.bitmap, 0, 0, size.width, size.height);

  const blob = await target.toBlob(quality);

  /* Safari antigo ignora o tipo pedido e devolve PNG em silêncio. Uma saída
     que não é WebP quebra a assinatura, que fixa o content-type. */
  if (blob.type !== OUTPUT_MIME) {
    throw new ImageProcessingError(SEM_WEBP);
  }

  return blob;
}

export const browserImageRuntime: ImageRuntime<BitmapImage> = {
  decode,
  encode,
};

/** Nome estável do arquivo enviado, por variante. A chave real é do servidor. */
export function uploadFileName(variant: MediaVariant): string {
  return `${variant}.webp`;
}
