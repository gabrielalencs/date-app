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

/**
 * Duas mensagens, porque são dois fatos diferentes.
 *
 * A versão anterior tinha uma só, e ela **afirmava** a causa: "se ela veio de
 * um iPhone, ela pode estar em HEIC". Só que esse texto disparava para qualquer
 * recusa do decodificador — um print de Android que falhasse por outro motivo
 * recebia uma explicação sobre iPhone, e quem lia ficava sem saber o que fazer
 * com um arquivo que não tinha nada de HEIC.
 *
 * Agora o palpite sobre HEIC só aparece quando o arquivo **é** HEIC, decidido
 * pelo tipo e pela extensão. No resto dos casos a mensagem diz o que houve, o
 * que se sabe do arquivo, e o que costuma resolver — sem inventar diagnóstico.
 */
const HEIC =
  "Essa foto está em HEIC, um formato que este navegador não abre. No iPhone, " +
  "em Ajustes → Câmera → Formatos, escolha “Mais compatível” para as próximas. " +
  "Para esta, abra na galeria e compartilhe como JPEG.";

function naoDecodificou(file: File, cause: unknown): string {
  const detalhe =
    cause instanceof Error && cause.message ? ` (${cause.message})` : "";
  const tipo = file.type || "tipo não informado";

  return (
    "Não foi possível abrir essa imagem neste navegador. " +
    `O arquivo chegou como ${tipo}, com ${Math.round(file.size / 1024)} KB. ` +
    "Tente outra foto, ou abra esta na galeria e salve uma cópia antes de " +
    `enviar.${detalhe}`
  );
}

/** HEIC/HEIF pelo tipo declarado ou pela extensão, que é o que sobra quando
    o `type` vem vazio do share sheet. */
function pareceHeic(file: File): boolean {
  const tipo = file.type.toLowerCase();
  if (tipo === "image/heic" || tipo === "image/heif") return true;

  return /\.(heic|heif)$/i.test(file.name);
}

const NAO_E_IMAGEM =
  "Esse arquivo não é uma imagem. Escolha um JPEG, um PNG ou um WebP.";

const GRANDE_DEMAIS =
  "Essa imagem é grande demais para ser processada aqui. Reduza a resolução " +
  "no celular e tente de novo.";

const NAO_COUBE =
  "Mesmo reduzida, essa imagem ficou acima do limite de envio. Corte um " +
  "pedaço ou escolha outra foto.";

/**
 * Degraus de redução, aplicados sobre o tamanho já calculado para a variante.
 *
 * Antes existia só a escada de qualidade: três encodes no mesmo tamanho e, se
 * nenhum coubesse, recusa. Isso rejeitava imagem legítima — print muito longo,
 * foto com muito detalhe fino — por um teto que reduzir 30% resolveria.
 *
 * Reduzir pixel preserva melhor a imagem do que espremer qualidade até o fim:
 * a 0.58 o WebP já borra. Por isso a segunda dimensão da escada existe, e por
 * isso ela só entra depois que a qualidade fez o que podia no tamanho cheio.
 *
 * Seis encodes no pior caso (3 + 2 + 1), e só no caso que antes era recusa.
 */
const SIZE_LADDER = [
  { escala: 1, qualidades: QUALITY_LADDER },
  { escala: 0.75, qualidades: QUALITY_LADDER.slice(1) },
  { escala: 0.5, qualidades: QUALITY_LADDER.slice(2) },
] as const;

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

/**
 * Tipos que sabidamente não são imagem. Recusar por esta lista, e não por
 * "não começa com image/", é o que abre a porta para a galeria.
 *
 * O `type` que chega do seletor de arquivos do Android não é confiável: além do
 * vazio, que já era tratado, aparecem `application/octet-stream` e derivados
 * quando o arquivo veio de outro app, de um cartão de memória ou de uma pasta
 * que o provedor de mídia não indexou. Nenhum deles diz que o arquivo não é
 * imagem — dizem que ninguém se deu ao trabalho de olhar.
 *
 * Quem sabe de verdade é o decodificador. Vídeo, áudio e PDF continuam sendo
 * recusados de cara, porque para esses o `type` é confiável e decodificar um
 * MP4 de 40 MB só para falhar é gastar a memória do celular à toa.
 */
const NAO_E_IMAGEM_PREFIXOS = ["video/", "audio/", "text/"] as const;
const NAO_E_IMAGEM_TIPOS = [
  "application/pdf",
  "application/zip",
  "application/json",
] as const;

function tipoRecusadoDeCara(type: string): boolean {
  const tipo = type.toLowerCase();

  return (
    NAO_E_IMAGEM_PREFIXOS.some((prefixo) => tipo.startsWith(prefixo)) ||
    (NAO_E_IMAGEM_TIPOS as readonly string[]).includes(tipo)
  );
}

/** Só valida o que dá para saber sem decodificar. */
export function assertAcceptableInput(file: File): void {
  if (file.size === 0) {
    throw new ImageProcessingError(SEM_PIXEL);
  }

  if (file.size > MAX_INPUT_BYTES) {
    throw new ImageProcessingError(GRANDE_DEMAIS);
  }

  if (tipoRecusadoDeCara(file.type)) {
    throw new ImageProcessingError(NAO_E_IMAGEM);
  }
}

/** Reduz um tamanho já calculado, sem nunca chegar a zero. */
function escalar(size: Size, fator: number): Size {
  if (fator === 1) return size;

  return {
    width: Math.max(1, Math.round(size.width * fator)),
    height: Math.max(1, Math.round(size.height * fator)),
  };
}

async function encodeWithinCap<TImage extends DecodedImage>(
  runtime: ImageRuntime<TImage>,
  image: TImage,
  variant: MediaVariant,
  size: Size,
): Promise<ProcessedVariant> {
  let ultimo: Blob | undefined;

  for (const degrau of SIZE_LADDER) {
    const alvo = escalar(size, degrau.escala);

    for (const quality of degrau.qualidades) {
      const blob = await runtime.encode(image, {
        variant,
        size: alvo,
        quality,
      });
      ultimo = blob;

      if (blob.size <= MAX_BYTES[variant]) {
        return { variant, blob, mimeType: OUTPUT_MIME, ...alvo };
      }
    }
  }

  /* Escada finita e para. Reencodar até caber é loop disfarçado, e uma imagem
     que não cabe com metade dos pixels a 0.58 tem um problema que nem qualidade
     nem tamanho resolvem. */
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
    throw new ImageProcessingError(
      pareceHeic(file) ? HEIC : naoDecodificou(file, cause),
      { cause },
    );
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
