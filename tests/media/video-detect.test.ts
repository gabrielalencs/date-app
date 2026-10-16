import { describe, expect, it } from "vitest";

import {
  hasVideoSignature,
  isDeclaredVideo,
  isVideoFile,
} from "@/features/media/video/detect";

/**
 * Foto ou vídeo (D-184). O caso perigoso é o do D-183 ao contrário: uma foto
 * HEIC sem tipo nem extensão também começa com `ftyp`, e não pode abrir a
 * gaveta de corte de vídeo.
 */
function arquivo(bytes: number[], name: string, type: string): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

/** `....ftyp` + marca, como no começo de um MP4/HEIC. */
function ftyp(marca: string): number[] {
  return [0, 0, 0, 0x18, ...Buffer.from("ftyp"), ...Buffer.from(marca), 0, 0];
}

describe("isDeclaredVideo", () => {
  it("reconhece pelo tipo e pela extensão", () => {
    expect(isDeclaredVideo(arquivo([], "x", "video/mp4"))).toBe(true);
    expect(isDeclaredVideo(arquivo([], "x", "video/quicktime"))).toBe(true);
    expect(isDeclaredVideo(arquivo([], "VID_1.MP4", ""))).toBe(true);
    expect(isDeclaredVideo(arquivo([], "clip.mov", ""))).toBe(true);
    expect(isDeclaredVideo(arquivo([], "foto.jpg", "image/jpeg"))).toBe(false);
  });
});

describe("hasVideoSignature", () => {
  it("reconhece MP4 do Android e MOV pela marca do ftyp", async () => {
    expect(await hasVideoSignature(arquivo(ftyp("mp42"), "x", ""))).toBe(true);
    expect(await hasVideoSignature(arquivo(ftyp("isom"), "x", ""))).toBe(true);
    expect(await hasVideoSignature(arquivo(ftyp("qt  "), "x", ""))).toBe(true);
  });

  it("reconhece WebM pelo cabeçalho EBML", async () => {
    expect(
      await hasVideoSignature(arquivo([0x1a, 0x45, 0xdf, 0xa3, 0x01], "x", "")),
    ).toBe(true);
  });

  it("HEIC e AVIF começam com ftyp, e não são vídeo", async () => {
    for (const marca of ["heic", "mif1", "avif"]) {
      expect(
        await hasVideoSignature(arquivo(ftyp(marca), "x", "")),
        marca,
      ).toBe(false);
    }
  });

  it("JPEG não é vídeo", async () => {
    expect(
      await hasVideoSignature(arquivo([0xff, 0xd8, 0xff, 0xe0, 0, 0], "x", "")),
    ).toBe(false);
  });
});

describe("isVideoFile", () => {
  it("vídeo sem tipo nem extensão é reconhecido pelo conteúdo", async () => {
    expect(
      await isVideoFile(
        arquivo(ftyp("mp42"), "arquivo", "application/octet-stream"),
      ),
    ).toBe(true);
  });

  it("foto declarada não é lida, mesmo com bytes de vídeo", async () => {
    expect(
      await isVideoFile(arquivo(ftyp("mp42"), "x.jpg", "image/jpeg")),
    ).toBe(false);
  });

  it("a foto HEIC sem tipo nem extensão do D-183 continua sendo foto", async () => {
    expect(
      await isVideoFile(
        arquivo(ftyp("heic"), "foto", "application/octet-stream"),
      ),
    ).toBe(false);
  });
});
