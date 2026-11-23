import { describe, expect, it } from "vitest";

import { summarizeFailures } from "@/features/media/upload-summary";

/**
 * O aviso de um lote que não subiu inteiro (D-185). A frase muda com quantos
 * falharam, e os nomes se agrupam por motivo, na ordem em que vieram.
 */
const arquivo = (name: string) => ({ name }) as File;

describe("summarizeFailures", () => {
  it("um só falhou", () => {
    const { headline } = summarizeFailures(3, [
      { file: arquivo("a.jpg"), error: "x" },
    ]);

    expect(headline).toBe("Um dos 3 arquivos não subiu.");
  });

  it("vários falharam, mas não todos", () => {
    const { headline } = summarizeFailures(5, [
      { file: arquivo("a.jpg"), error: "x" },
      { file: arquivo("b.jpg"), error: "y" },
    ]);

    expect(headline).toBe("2 dos 5 arquivos não subiram.");
  });

  it("todos falharam", () => {
    const { headline } = summarizeFailures(2, [
      { file: arquivo("a.jpg"), error: "x" },
      { file: arquivo("b.jpg"), error: "x" },
    ]);

    expect(headline).toBe("Nenhum dos 2 arquivos subiu.");
  });

  it("agrupa os nomes por motivo, na ordem em que vieram", () => {
    const { groups } = summarizeFailures(6, [
      { file: arquivo("a.heic"), error: "HEIC" },
      { file: arquivo("b.jpg"), error: "rede" },
      { file: arquivo("c.heic"), error: "HEIC" },
      { file: arquivo("d.heic"), error: "HEIC" },
    ]);

    expect(groups).toEqual([
      { reason: "HEIC", names: ["a.heic", "c.heic", "d.heic"] },
      { reason: "rede", names: ["b.jpg"] },
    ]);
  });

  it("o mesmo nome duas vezes aparece duas vezes: são dois arquivos", () => {
    const { groups } = summarizeFailures(2, [
      { file: arquivo("IMG.jpg"), error: "x" },
      { file: arquivo("IMG.jpg"), error: "x" },
    ]);

    expect(groups).toEqual([{ reason: "x", names: ["IMG.jpg", "IMG.jpg"] }]);
  });
});
