/**
 * Foto ou vídeo, decidido no aparelho antes de qualquer processamento
 * (D-184).
 *
 * O mesmo cuidado da foto (`tipoRecusadoDeCara` em `process-image.ts`): o
 * `type` que o seletor do Android entrega não é confiável. Vídeo vindo de
 * outro app, de cartão de memória ou de pasta não indexada chega como
 * `application/octet-stream`, às vezes sem extensão. Nesses casos o conteúdo
 * responde — o começo do arquivo diz qual é o contêiner.
 */

const EXTENSOES_DE_VIDEO = /\.(mp4|m4v|mov|3gp|3g2|webm|mkv)$/i;

/**
 * Marcas de `ftyp` de vídeo. A lista é fechada de propósito: HEIC e AVIF
 * também começam com `ftyp`, e são foto. Sem a lista, uma foto HEIC sem tipo
 * nem extensão — exatamente o caso do D-183 — abriria a tela de corte de
 * vídeo.
 */
const MARCAS_DE_VIDEO = new Set([
  "isom",
  "iso2",
  "iso4",
  "iso5",
  "iso6",
  "mp41",
  "mp42",
  "avc1",
  "M4V ",
  "M4VH",
  "M4VP",
  "qt  ",
  "3gp4",
  "3gp5",
  "3gp6",
  "3g2a",
  "3g2b",
  "mmp4",
  "MSNV",
  "dash",
]);

/** Cabeçalho EBML: WebM e Matroska. */
const EBML = [0x1a, 0x45, 0xdf, 0xa3] as const;

/** Vídeo pelo tipo declarado ou pela extensão — o que o sistema diz. */
export function isDeclaredVideo(file: File): boolean {
  if (file.type.toLowerCase().startsWith("video/")) return true;
  return EXTENSOES_DE_VIDEO.test(file.name);
}

/** Vídeo pelo conteúdo: doze bytes respondem, sem ler o arquivo. */
export async function hasVideoSignature(file: Blob): Promise<boolean> {
  const cabecalho = new Uint8Array(await file.slice(0, 12).arrayBuffer());

  if (EBML.every((byte, indice) => cabecalho[indice] === byte)) {
    return true;
  }

  if (cabecalho.length < 12) return false;

  const ascii = (inicio: number) =>
    String.fromCharCode(...cabecalho.subarray(inicio, inicio + 4));

  return ascii(4) === "ftyp" && MARCAS_DE_VIDEO.has(ascii(8));
}

/**
 * Foto declarada é foto: um `image/*` não passa pela leitura do conteúdo.
 * Tipo vazio ou genérico, sem extensão de vídeo, é que vai para os bytes.
 */
export async function isVideoFile(file: File): Promise<boolean> {
  const tipo = file.type.toLowerCase();

  if (tipo.startsWith("image/")) return false;
  if (isDeclaredVideo(file)) return true;

  return hasVideoSignature(file);
}
