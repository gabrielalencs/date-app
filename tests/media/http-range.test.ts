import { describe, expect, it } from "vitest";

import {
  contentRange,
  rangeHeader,
  rangeLength,
  resolveRange,
} from "@/features/media/http-range";

/**
 * Aritmética de bytes do Range (D-184). É o tipo de conta que erra por um, e
 * um erro aqui é vídeo que trava no meio ou que não toca no Safari.
 */
const TAMANHO = 10_000;
const PEDACO = 4_000;

describe("resolveRange", () => {
  it("sem cabeçalho, responde o objeto inteiro", () => {
    expect(resolveRange(null, TAMANHO, PEDACO)).toEqual({ kind: "whole" });
  });

  it("bytes=0- vira o primeiro pedaço, nunca o arquivo inteiro", () => {
    expect(resolveRange("bytes=0-", TAMANHO, PEDACO)).toEqual({
      kind: "partial",
      range: { start: 0, end: 3_999 },
    });
  });

  it("o pedido de dois bytes do Safari é respondido como pedido", () => {
    expect(resolveRange("bytes=0-1", TAMANHO, PEDACO)).toEqual({
      kind: "partial",
      range: { start: 0, end: 1 },
    });
  });

  it("um intervalo fechado dentro do teto sai exato", () => {
    expect(resolveRange("bytes=100-199", TAMANHO, PEDACO)).toEqual({
      kind: "partial",
      range: { start: 100, end: 199 },
    });
  });

  it("um intervalo fechado acima do teto é cortado no teto", () => {
    expect(resolveRange("bytes=1000-9999", TAMANHO, PEDACO)).toEqual({
      kind: "partial",
      range: { start: 1_000, end: 4_999 },
    });
  });

  it("o fim nunca passa do último byte", () => {
    expect(resolveRange("bytes=9000-20000", TAMANHO, PEDACO)).toEqual({
      kind: "partial",
      range: { start: 9_000, end: 9_999 },
    });
    expect(resolveRange("bytes=9999-", TAMANHO, PEDACO)).toEqual({
      kind: "partial",
      range: { start: 9_999, end: 9_999 },
    });
  });

  it("sufixo pede os últimos bytes", () => {
    expect(resolveRange("bytes=-500", TAMANHO, PEDACO)).toEqual({
      kind: "partial",
      range: { start: 9_500, end: 9_999 },
    });
  });

  it("sufixo maior que o arquivo é o arquivo desde o começo, até o teto", () => {
    expect(resolveRange("bytes=-50000", TAMANHO, PEDACO)).toEqual({
      kind: "partial",
      range: { start: 0, end: 3_999 },
    });
  });

  it("começar no fim ou depois é 416", () => {
    expect(resolveRange("bytes=10000-", TAMANHO, PEDACO)).toEqual({
      kind: "unsatisfiable",
    });
    expect(resolveRange("bytes=12000-13000", TAMANHO, PEDACO)).toEqual({
      kind: "unsatisfiable",
    });
    expect(resolveRange("bytes=-0", TAMANHO, PEDACO)).toEqual({
      kind: "unsatisfiable",
    });
  });

  it("ignora o que não sabe responder, em vez de errar", () => {
    for (const ignorado of [
      "items=0-10",
      "bytes=0-1,5-9",
      "bytes=10-5",
      "bytes=-",
      "bytes=abc-",
      "bytes 0-10",
      "",
    ]) {
      expect(resolveRange(ignorado, TAMANHO, PEDACO), ignorado).toEqual({
        kind: "whole",
      });
    }
  });

  it("tolera espaço em volta do valor", () => {
    expect(resolveRange("  bytes=0-9  ", TAMANHO, PEDACO)).toEqual({
      kind: "partial",
      range: { start: 0, end: 9 },
    });
  });
});

describe("cabeçalhos do 206", () => {
  it("Content-Range, Range e tamanho batem com o intervalo", () => {
    const range = { start: 4_000, end: 7_999 };

    expect(contentRange(range, TAMANHO)).toBe("bytes 4000-7999/10000");
    expect(rangeHeader(range)).toBe("bytes=4000-7999");
    expect(rangeLength(range)).toBe(4_000);
  });
});
