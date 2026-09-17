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

/**
 * O que a etapa de encode vai desenhar no canvas.
 *
 * `ImageBitmap` é o caminho normal; `HTMLImageElement` é o resgate. Os dois são
 * `CanvasImageSource`, então `drawImage` aceita qualquer um e o encode não
 * precisa saber por onde a imagem entrou.
 */
type BitmapImage = DecodedImage & {
  bitmap: ImageBitmap | HTMLImageElement;
};

const SEM_WEBP =
  "Este navegador não conseguiu gerar a imagem no formato usado pelo DATE. " +
  "Atualize o navegador e tente de novo.";

const SEM_CANVAS =
  "Este navegador não conseguiu preparar a imagem para envio. Atualize o " +
  "navegador e tente de novo.";

/**
 * Decodifica pelo elemento `<img>`, que é um decodificador diferente do de
 * `createImageBitmap` e aceita arquivos que o outro recusa.
 *
 * Ele aplica a orientação do EXIF sozinho, como faz com qualquer imagem da
 * página, então o resultado bate com o do `from-image` do caminho principal.
 */
async function decodeViaElement(file: File): Promise<BitmapImage> {
  const url = URL.createObjectURL(file);
  const img = new Image();

  try {
    img.src = url;
    await img.decode();
  } catch (cause) {
    URL.revokeObjectURL(url);
    throw cause;
  }

  return {
    bitmap: img,
    width: img.naturalWidth,
    height: img.naturalHeight,
    close: () => URL.revokeObjectURL(url),
  };
}

/**
 * Decodificação em escada, do caminho bom para o caminho que salva.
 *
 * 1. `createImageBitmap` com `imageOrientation: "from-image"`. É o caminho
 *    normal, e o `from-image` importa: o reencode descarta o EXIF, então sem
 *    ele uma foto tirada de lado subiria deitada — o giro estaria só no
 *    metadado que estamos jogando fora.
 * 2. `createImageBitmap` sem opção nenhuma. Um motor que não conheça a opção
 *    rejeita a chamada inteira, e aí a foto não abre por um detalhe que não
 *    tem nada a ver com o arquivo. **Ressalva declarada:** sem `from-image`,
 *    uma foto tirada de lado sobe deitada, porque o giro estava no EXIF que o
 *    reencode descarta. É troca consciente — este degrau só roda quando a
 *    alternativa é a foto não subir de jeito nenhum, e print de celular, que é
 *    o caso que motivou a escada, nasce sem orientação para perder.
 * 3. `<img>` + `decode()`. Outro decodificador, com outra lista de formatos e
 *    outras tolerâncias a arquivo levemente fora do padrão.
 *
 * Uma tentativa só era o que fazia print de Android esbarrar numa mensagem
 * sobre iPhone: qualquer recusa do primeiro caminho virava "não dá para abrir".
 */
async function decode(file: File): Promise<BitmapImage> {
  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    return {
      bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
  } catch {
    // segue para a próxima tentativa
  }

  try {
    const bitmap = await createImageBitmap(file);
    return {
      bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
  } catch {
    // segue para a próxima tentativa
  }

  /* A última falha é a que sobe, com a causa original: é ela que a mensagem
     vai usar para dizer o que de fato aconteceu. */
  return decodeViaElement(file);
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
