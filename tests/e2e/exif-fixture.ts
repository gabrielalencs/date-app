import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

/**
 * Uma imagem com metadado conhecido, para provar que o reencode o descarta.
 *
 * PNG e não JPEG porque um JPEG com EXIF válido teria que ser escrito à mão ou
 * versionado no repo, e o `eXIf` do PNG carrega exatamente o mesmo bloco TIFF
 * — inclusive a IFD de GPS, que é o metadado que importa aqui (D-051). O que
 * está sob teste é o descarte, não o formato do contêiner.
 *
 * O marcador é uma string ASCII improvável de aparecer por acaso num WebP.
 */
export const EXIF_MARCADOR = "DATE-GPS-MARCADOR-B5";

function crc32(buffer: Uint8Array): number {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const cabecalho = Buffer.alloc(4);
  cabecalho.writeUInt32BE(data.length, 0);

  const corpo = Buffer.concat([Buffer.from(type, "ascii"), data]);

  const checagem = Buffer.alloc(4);
  checagem.writeUInt32BE(crc32(corpo), 0);

  return Buffer.concat([cabecalho, corpo, checagem]);
}

/** Bloco TIFF mínimo, com uma tag ASCII contendo o marcador. */
function tiffComMarcador(): Buffer {
  const marcador = Buffer.from(`${EXIF_MARCADOR}\0`, "ascii");

  const cabecalho = Buffer.alloc(8);
  cabecalho.write("II", 0, "ascii"); // little-endian
  cabecalho.writeUInt16LE(42, 2);
  cabecalho.writeUInt32LE(8, 4); // offset da IFD0

  const ifd = Buffer.alloc(2 + 12 + 4);
  ifd.writeUInt16LE(1, 0); // uma entrada
  ifd.writeUInt16LE(0x9286, 2); // UserComment
  ifd.writeUInt16LE(2, 4); // ASCII
  ifd.writeUInt32LE(marcador.length, 6);
  ifd.writeUInt32LE(cabecalho.length + ifd.length, 10); // offset do valor
  ifd.writeUInt32LE(0, 14); // sem próxima IFD

  return Buffer.concat([cabecalho, ifd, marcador]);
}

/**
 * Devolve os bytes de um PNG real do repo com um chunk `eXIf` injetado logo
 * depois do IHDR, que é onde a especificação o permite.
 */
export async function pngComExif(origem: string): Promise<Buffer> {
  const original = await readFile(origem);

  // 8 bytes de assinatura, depois o IHDR: 4 de tamanho + 4 de tipo + 13 + 4.
  const fimDoIhdr = 8 + 4 + 4 + 13 + 4;
  if (original.subarray(12, 16).toString("ascii") !== "IHDR") {
    throw new Error("O arquivo de origem não começa com IHDR.");
  }

  const comExif = Buffer.concat([
    original.subarray(0, fimDoIhdr),
    chunk("eXIf", tiffComMarcador()),
    original.subarray(fimDoIhdr),
  ]);

  if (!comExif.includes(EXIF_MARCADOR)) {
    throw new Error("O marcador não entrou no arquivo.");
  }

  return comExif;
}

export function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 12);
}
