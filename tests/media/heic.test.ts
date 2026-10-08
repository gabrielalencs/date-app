import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { hasHeifBrand, isDeclaredHeic } from "@/features/media/image/heic";

/**
 * Quando a escada de decodificação chama a libheif (D-183).
 *
 * A conversão em si só existe no navegador e é provada em
 * `tests/e2e/media.spec.ts`. O que se prova aqui é a decisão de chamá-la: um
 * falso negativo deixa foto HEIC sem subir, e um falso positivo baixa 3 MB de
 * biblioteca para nada.
 */

/** O começo de um arquivo ISO-BMFF: tamanho da caixa, `ftyp` e a marca. */
function cabecalho(marca: string): Blob {
  const bytes = new Uint8Array(24);
  bytes.set([0, 0, 0, 24], 0);
  bytes.set(new TextEncoder().encode(`ftyp${marca}`), 4);
  return new Blob([bytes]);
}

function arquivo(type: string, name: string): File {
  return { type, name } as File;
}

describe("o que o sistema declara", () => {
  it("reconhece HEIC pelo tipo e pela extensão, em qualquer caixa", () => {
    expect(isDeclaredHeic(arquivo("image/heic", "foto"))).toBe(true);
    expect(isDeclaredHeic(arquivo("image/heif", "foto"))).toBe(true);
    expect(isDeclaredHeic(arquivo("IMAGE/HEIC", "foto"))).toBe(true);
    /* `type` vazio é o que o share sheet entrega; sobra a extensão. */
    expect(isDeclaredHeic(arquivo("", "20261007_121314.HEIC"))).toBe(true);
    expect(isDeclaredHeic(arquivo("", "IMG_0002.heif"))).toBe(true);
  });

  it("não chama de HEIC o que não diz ser", () => {
    expect(isDeclaredHeic(arquivo("image/jpeg", "foto.jpg"))).toBe(false);
    expect(isDeclaredHeic(arquivo("", "heic-mas-nao.jpg"))).toBe(false);
  });
});

describe("o que o conteúdo diz", () => {
  it("lê as marcas HEIF, inclusive a genérica mif1", async () => {
    for (const marca of ["heic", "heix", "hevc", "mif1", "msf1"]) {
      expect(await hasHeifBrand(cabecalho(marca)), marca).toBe(true);
    }
  });

  it("reconhece o HEIC real da fixture, que declara mif1 como principal", async () => {
    const bytes = readFileSync("tests/e2e/fixtures/exemplo.heic");
    expect(await hasHeifBrand(new Blob([bytes]))).toBe(true);
  });

  it("não confunde AVIF, JPEG nem arquivo curto com HEIC", async () => {
    /* AVIF o Chrome abre sozinho: confundi-lo baixaria a libheif à toa. */
    expect(await hasHeifBrand(cabecalho("avif"))).toBe(false);

    const jpeg = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16])]);
    expect(await hasHeifBrand(jpeg)).toBe(false);

    expect(await hasHeifBrand(new Blob([new Uint8Array(8)]))).toBe(false);
  });
});
