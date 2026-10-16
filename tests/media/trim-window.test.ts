import { describe, expect, it } from "vitest";

import {
  formatClock,
  initialWindow,
  isValidWindow,
  moveEnd,
  moveStart,
  spokenDuration,
  windowLength,
} from "@/features/media/video/trim-window";

/**
 * A régua de corte (D-184). O caso que importa é o comum: vídeo longo, trecho
 * no teto, e a pessoa arrastando uma alça só.
 */
describe("initialWindow", () => {
  it("vídeo longo nasce do começo até o teto de 60 s", () => {
    expect(initialWindow(600)).toEqual({ start: 0, end: 60 });
  });

  it("vídeo que cabe nasce inteiro, sem o fim passar da duração", () => {
    expect(initialWindow(42.37)).toEqual({ start: 0, end: 42.37 });
    expect(initialWindow(42.31)).toEqual({ start: 0, end: 42.3 });
  });
});

describe("moveStart", () => {
  it("com o trecho no teto, o início desliza o trecho inteiro", () => {
    const janela = moveStart({ start: 0, end: 60 }, 125, 600);
    expect(janela).toEqual({ start: 125, end: 185 });
    expect(windowLength(janela)).toBe(60);
  });

  it("arrastar passo a passo dá o mesmo trecho que soltar no ponto", () => {
    /* A régua chama a cada passo do arrasto. Encolher nos passos do meio e
       empurrar depois terminaria num trecho de um segundo. */
    let janela = initialWindow(600);
    for (let segundo = 1; segundo <= 125; segundo += 1) {
      janela = moveStart(janela, segundo, 600);
    }
    expect(janela).toEqual({ start: 125, end: 185 });
  });

  it("com folga, o início anda sozinho e o trecho encurta", () => {
    expect(moveStart({ start: 0, end: 30 }, 10, 600)).toEqual({
      start: 10,
      end: 30,
    });
  });

  it("com folga, o início para um segundo antes do fim", () => {
    expect(moveStart({ start: 0, end: 30 }, 45, 600)).toEqual({
      start: 29,
      end: 30,
    });
  });

  it("para trás além do teto, o fim vem junto", () => {
    expect(moveStart({ start: 125, end: 185 }, 100, 600)).toEqual({
      start: 100,
      end: 160,
    });
  });

  it("deslizando até o fim do vídeo, o trecho encolhe mas não some", () => {
    expect(moveStart({ start: 500, end: 560 }, 9_999, 600)).toEqual({
      start: 599,
      end: 600,
    });
  });

  it("vídeo que cabe inteiro não desliza: o início encurta", () => {
    expect(moveStart({ start: 0, end: 42 }, 10, 42)).toEqual({
      start: 10,
      end: 42,
    });
  });

  it("não vai para antes do zero", () => {
    expect(moveStart({ start: 10, end: 40 }, -5, 600).start).toBe(0);
  });
});

describe("moveEnd", () => {
  it("para frente além do teto, o início vem junto", () => {
    expect(moveEnd({ start: 0, end: 60 }, 200, 600)).toEqual({
      start: 140,
      end: 200,
    });
  });

  it("puxar o fim para trás encurta o trecho", () => {
    expect(moveEnd({ start: 0, end: 60 }, 8, 600)).toEqual({
      start: 0,
      end: 8,
    });
  });

  it("o fim para um segundo depois do início", () => {
    expect(moveEnd({ start: 20, end: 40 }, 5, 600)).toEqual({
      start: 20,
      end: 21,
    });
  });

  it("não passa da duração", () => {
    expect(moveEnd({ start: 500, end: 560 }, 9_999, 600)).toEqual({
      start: 540,
      end: 600,
    });
  });

  it("arredonda para o décimo, sem lixo de ponto flutuante", () => {
    const janela = moveEnd({ start: 0.1, end: 0.2 }, 12.300000000000001, 600);
    expect(janela.end).toBe(12.3);
  });
});

describe("isValidWindow", () => {
  it("aceita o trecho no teto e o mínimo", () => {
    expect(isValidWindow({ start: 0, end: 60 }, 600)).toBe(true);
    expect(isValidWindow({ start: 10, end: 11 }, 600)).toBe(true);
  });

  it("recusa trecho longo, curto, invertido ou fora do vídeo", () => {
    expect(isValidWindow({ start: 0, end: 61 }, 600)).toBe(false);
    expect(isValidWindow({ start: 10, end: 10.5 }, 600)).toBe(false);
    expect(isValidWindow({ start: 20, end: 10 }, 600)).toBe(false);
    expect(isValidWindow({ start: 590, end: 610 }, 600)).toBe(false);
    expect(isValidWindow({ start: -1, end: 30 }, 600)).toBe(false);
    expect(isValidWindow({ start: Number.NaN, end: 30 }, 600)).toBe(false);
  });
});

describe("formatClock e spokenDuration", () => {
  it("formata como relógio de player", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(5)).toBe("0:05");
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(754)).toBe("12:34");
    expect(formatClock(3723)).toBe("1:02:03");
    expect(formatClock(59.6)).toBe("1:00");
  });

  it("diz o tempo por extenso para leitor de tela", () => {
    expect(spokenDuration(0)).toBe("0 segundos");
    expect(spokenDuration(1)).toBe("1 segundo");
    expect(spokenDuration(12)).toBe("12 segundos");
    expect(spokenDuration(60)).toBe("1 minuto");
    expect(spokenDuration(125)).toBe("2 minutos e 5 segundos");
  });
});
