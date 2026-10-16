import {
  MAX_VIDEO_SECONDS,
  MIN_VIDEO_SECONDS,
} from "@/features/media/constants";

/**
 * O trecho escolhido de um vídeo, em segundos do arquivo original (D-184).
 *
 * Funções puras, sem DOM: a tela tem duas alças, e o que cada uma faz com a
 * outra é regra, não detalhe de componente. A régua dispara a cada passo do
 * arrasto, então a regra precisa dar certo também nos estados do meio — não
 * só no ponto onde o dedo para.
 *
 * Três regras:
 *
 * 1. **Com o trecho no teto, o início desliza o trecho.** É o estado em que a
 *    gaveta abre num vídeo longo, e o gesto mais natural é levar o início até
 *    onde o minuto deve começar. Se o início encurtasse o trecho, arrastá-lo
 *    de 0:00 até 2:05 passaria por todos os tamanhos e terminaria num trecho
 *    de um segundo.
 * 2. **Nenhuma alça passa do teto.** Puxar o fim para frente além dele traz
 *    o início junto; puxar o início para trás além dele traz o fim.
 * 3. **Nenhuma alça atravessa a outra.** Fora do caso 1, a alça para a um
 *    segundo da outra.
 */
export type TrimWindow = Readonly<{ start: number; end: number }>;

type Limits = { max?: number; min?: number };

/** Décimo de segundo: o passo das alças, e o que evita 12.300000000000001. */
function arredondar(segundos: number): number {
  return Math.round(segundos * 10) / 10;
}

function limitar(valor: number, menor: number, maior: number): number {
  return Math.min(Math.max(valor, menor), maior);
}

/**
 * Um fim arredondado nunca passa da duração: 42,37 s arredondado é 42,4, e
 * pedir à conversão para cortar depois do último quadro é pedir o que não
 * existe. No limite, o fim é a própria duração, sem arredondar.
 */
function fimDentro(segundos: number, duration: number): number {
  return Math.min(arredondar(segundos), duration);
}

/** Do começo até o teto — ou o vídeo inteiro, quando ele cabe. */
export function initialWindow(
  duration: number,
  { max = MAX_VIDEO_SECONDS }: Limits = {},
): TrimWindow {
  return { start: 0, end: fimDentro(Math.min(duration, max), duration) };
}

export function windowLength(window: TrimWindow): number {
  return arredondar(window.end - window.start);
}

/** Folga de comparação: o trecho "no teto" pode ter 59,95 s por arredondamento. */
const QUASE = 0.05;

/** A alça do início foi para `start`. */
export function moveStart(
  window: TrimWindow,
  start: number,
  duration: number,
  { max = MAX_VIDEO_SECONDS, min = MIN_VIDEO_SECONDS }: Limits = {},
): TrimWindow {
  let inicio = arredondar(limitar(start, 0, Math.max(0, duration - min)));
  const tamanho = window.end - window.start;

  // Regra 1: no teto e indo para frente, o trecho inteiro anda junto.
  if (inicio > window.start && tamanho >= max - QUASE) {
    const fim = fimDentro(inicio + tamanho, duration);
    if (fim - inicio < min) inicio = arredondar(fim - min);
    return { start: inicio, end: fim };
  }

  let fim = window.end;
  // Regra 2: para trás além do teto, o fim vem junto.
  if (fim - inicio > max) fim = inicio + max;
  // Regra 3: não atravessa o fim.
  if (fim - inicio < min) inicio = arredondar(Math.max(0, fim - min));

  return { start: inicio, end: fimDentro(fim, duration) };
}

/** A alça do fim foi para `end`. */
export function moveEnd(
  window: TrimWindow,
  end: number,
  duration: number,
  { max = MAX_VIDEO_SECONDS, min = MIN_VIDEO_SECONDS }: Limits = {},
): TrimWindow {
  let fim = fimDentro(
    limitar(end, Math.min(min, duration), duration),
    duration,
  );
  let inicio = window.start;

  // Regra 2: para frente além do teto, o início vem junto.
  if (fim - inicio > max) inicio = fim - max;
  // Regra 3: não atravessa o início.
  if (fim - inicio < min) fim = fimDentro(inicio + min, duration);

  return { start: arredondar(inicio), end: fim };
}

/**
 * O trecho que a conversão aceita. A tela nunca produz um inválido; isto é a
 * guarda para o que chega por outro caminho.
 */
export function isValidWindow(
  window: TrimWindow,
  duration: number,
  { max = MAX_VIDEO_SECONDS, min = MIN_VIDEO_SECONDS }: Limits = {},
): boolean {
  const tamanho = window.end - window.start;
  const folga = 0.05;

  return (
    Number.isFinite(window.start) &&
    Number.isFinite(window.end) &&
    window.start >= 0 &&
    window.end <= duration + folga &&
    tamanho >= min - folga &&
    tamanho <= max + folga
  );
}

/** `0:05`, `1:05`, `12:34`, `1:02:03` — o relógio de qualquer player. */
export function formatClock(segundos: number): string {
  const total = Math.max(0, Math.round(segundos));
  const horas = Math.floor(total / 3600);
  const minutos = Math.floor((total % 3600) / 60);
  const resto = total % 60;
  const ss = String(resto).padStart(2, "0");

  return horas > 0
    ? `${horas}:${String(minutos).padStart(2, "0")}:${ss}`
    : `${minutos}:${ss}`;
}

/**
 * O mesmo tempo, para leitor de tela. "0:12" é lido como "zero, doze", e o
 * `aria-valuetext` de uma alça precisa dizer o que ela marca.
 */
export function spokenDuration(segundos: number): string {
  const total = Math.max(0, Math.round(segundos));
  const minutos = Math.floor(total / 60);
  const resto = total % 60;

  const partes: string[] = [];
  if (minutos > 0)
    partes.push(`${minutos} ${minutos === 1 ? "minuto" : "minutos"}`);
  if (resto > 0 || minutos === 0) {
    partes.push(`${resto} ${resto === 1 ? "segundo" : "segundos"}`);
  }

  return partes.join(" e ");
}
