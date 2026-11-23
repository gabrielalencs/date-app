import { afterEach, describe, expect, it, vi } from "vitest";

import { manterTelaAcesa } from "@/features/media/keep-screen-on";

/**
 * A tela acesa durante um lote de fotos ou a conversão de um vídeo (D-185).
 * O navegador solta a trava quando a aba some; ao voltar, ela é pedida de
 * novo, até quem pediu soltar.
 */
type Trava = { release: ReturnType<typeof vi.fn> };

function trava(): Trava {
  return { release: vi.fn(async () => {}) };
}

function ambiente(pedido: () => Promise<Trava>) {
  const documento = Object.assign(new EventTarget(), {
    visibilityState: "visible" as "visible" | "hidden",
  });
  const request = vi.fn(pedido);

  vi.stubGlobal("document", documento);
  vi.stubGlobal("navigator", { wakeLock: { request } });

  return {
    request,
    voltar() {
      documento.visibilityState = "visible";
      documento.dispatchEvent(new Event("visibilitychange"));
    },
    sumir() {
      documento.visibilityState = "hidden";
      documento.dispatchEvent(new Event("visibilitychange"));
    },
  };
}

/** Deixa as promessas pendentes andarem. */
const andar = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("manterTelaAcesa", () => {
  it("sem Wake Lock no navegador, segue sem, e soltar não quebra", async () => {
    vi.stubGlobal("navigator", {});

    const soltar = await manterTelaAcesa();

    expect(() => soltar()).not.toThrow();
  });

  it("pede a trava e a solta uma vez só, mesmo chamado duas vezes", async () => {
    const primeira = trava();
    const { request } = ambiente(async () => primeira);

    const soltar = await manterTelaAcesa();
    soltar();
    soltar();

    expect(request).toHaveBeenCalledWith("screen");
    expect(primeira.release).toHaveBeenCalledTimes(1);
  });

  it("pede de novo quando a aba volta, e não quando some", async () => {
    const { request, voltar, sumir } = ambiente(async () => trava());

    const soltar = await manterTelaAcesa();
    sumir();
    await andar();
    expect(request).toHaveBeenCalledTimes(1);

    voltar();
    await andar();
    expect(request).toHaveBeenCalledTimes(2);

    soltar();
  });

  it("depois de soltar, voltar à aba não pede nada", async () => {
    const { request, voltar } = ambiente(async () => trava());

    const soltar = await manterTelaAcesa();
    soltar();
    voltar();
    await andar();

    expect(request).toHaveBeenCalledTimes(1);
  });

  it("a trava que chega depois de soltar é solta na hora", async () => {
    const atrasada = trava();
    let chegar: (t: Trava) => void = () => {};
    let n = 0;
    const { voltar } = ambiente(() =>
      ++n === 1
        ? Promise.resolve(trava())
        : new Promise<Trava>((resolve) => {
            chegar = resolve;
          }),
    );

    const soltar = await manterTelaAcesa();
    voltar(); // segundo pedido, ainda no ar
    soltar();
    chegar(atrasada);
    await andar();

    expect(atrasada.release).toHaveBeenCalledTimes(1);
  });

  it("pedido recusado não lança: segue sem trava", async () => {
    ambiente(async () => {
      throw new DOMException("not allowed", "NotAllowedError");
    });

    const soltar = await manterTelaAcesa();

    expect(() => soltar()).not.toThrow();
  });
});
