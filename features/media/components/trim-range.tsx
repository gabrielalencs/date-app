"use client";

import {
  formatClock,
  moveEnd,
  moveStart,
  spokenDuration,
  windowLength,
  type TrimWindow,
} from "@/features/media/video/trim-window";
import { cn } from "@/lib/cn";

/**
 * A régua de corte: um trecho dentro de uma duração, com duas alças.
 *
 * As alças são `<input type="range">` nativos — teclado, leitor de tela e
 * arrasto no toque vêm do navegador. O desenho mora em `.trim-range`, no
 * `globals.css`. A regra de como uma alça empurra a outra é de
 * `features/media/video/trim-window.ts` e é testada sem DOM.
 *
 * Controlada: quem usa guarda o trecho e recebe o novo a cada movimento,
 * junto com qual alça mexeu — a prévia do vídeo pula para o ponto dela.
 */

/**
 * As alças contam em **décimos de segundo inteiros**, não em segundos com
 * `step="0.1"`. Uma duração como 42,37 s não cai na grade de 0,1, e o
 * navegador arredonda o máximo para baixo: o fim do vídeo ficava inalcançável
 * e a alça desenhada discordava do trecho. Com o máximo arredondado para
 * cima, a alça chega ao fim, e quem limita o valor à duração real é a regra
 * do trecho.
 */
const DECIMOS = 10;

/** Onde, na régua, cai uma fração de 0 a 1 — o centro da alça anda de 22px a (largura − 22px). */
function posicao(fracao: number): string {
  return `(1.375rem + (100% - 2.75rem) * ${fracao})`;
}

export function TrimRange({
  duration,
  value,
  onChange,
  disabled = false,
  className,
}: {
  duration: number;
  value: TrimWindow;
  onChange: (next: TrimWindow, moved: "start" | "end") => void;
  disabled?: boolean;
  className?: string;
}) {
  const total = Math.max(duration, 0.1);
  const maximo = Math.max(1, Math.ceil(total * DECIMOS));
  const inicio = Math.round(value.start * DECIMOS);
  const fim = Math.round(value.end * DECIMOS);
  const meio = (inicio + fim) / 2 / maximo;

  /* As duas alças ocupam a mesma caixa. Quando ficam a menos de 44px uma da
     outra, a de cima tomaria todo toque, e a de baixo ficaria inalcançável —
     com o trecho curto, a pessoa não conseguiria voltar o início. Cada alça
     só recebe toque do seu lado do ponto médio entre as duas: perto uma da
     outra, a metade esquerda é do início e a direita é do fim. O recorte vale
     para o toque e para o desenho; longe uma da outra, ele não corta nada.
     As margens negativas deixam o contorno de foco de fora do recorte. */
  const recorteInicio = `inset(-0.5rem calc(100% - ${posicao(meio)}) -0.5rem -0.5rem)`;
  const recorteFim = `inset(-0.5rem -0.5rem -0.5rem calc${posicao(meio)})`;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="trim-range" data-disabled={disabled || undefined}>
        <div className="trim-range__track" aria-hidden="true" />
        <div
          className="trim-range__window"
          aria-hidden="true"
          style={{
            left: `calc${posicao(inicio / maximo)}`,
            width: `calc((100% - 2.75rem) * ${(fim - inicio) / maximo})`,
          }}
        />
        <input
          type="range"
          min={0}
          max={maximo}
          step={1}
          value={inicio}
          disabled={disabled}
          aria-label="Início do trecho"
          aria-valuetext={spokenDuration(value.start)}
          style={{ clipPath: recorteInicio }}
          onChange={(event) =>
            onChange(
              moveStart(value, Number(event.target.value) / DECIMOS, total),
              "start",
            )
          }
        />
        <input
          type="range"
          min={0}
          max={maximo}
          step={1}
          value={fim}
          disabled={disabled}
          aria-label="Fim do trecho"
          aria-valuetext={spokenDuration(value.end)}
          style={{ clipPath: recorteFim }}
          onChange={(event) =>
            onChange(
              moveEnd(value, Number(event.target.value) / DECIMOS, total),
              "end",
            )
          }
        />
      </div>

      <div className="type-meta text-text-muted tnum flex items-baseline justify-between gap-3">
        <span>{formatClock(value.start)}</span>
        <span className="text-text font-medium">
          Trecho de {formatClock(windowLength(value))}
        </span>
        <span>{formatClock(value.end)}</span>
      </div>
    </div>
  );
}
