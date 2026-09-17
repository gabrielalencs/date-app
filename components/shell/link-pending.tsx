"use client";

import { useLinkStatus } from "next/link";

import { cn } from "@/lib/cn";

/**
 * O sinal de que o toque foi ouvido.
 *
 * **O problema que ele resolve.** Toda rota privada é dinâmica, e navegar para
 * rota dinâmica sem `loading.js` *bloqueia*: a tela anterior fica congelada até
 * o servidor responder. Medido em viewport de celular com 150 ms de latência,
 * tocar em Ideias deixava a interface parada por 898 ms sem nenhum sinal — e o
 * reflexo de quem toca e não vê nada é tocar de novo.
 *
 * **Por que não `loading.tsx`.** Foi a primeira tentativa, e ela custou três
 * defeitos reais, todos medidos e todos pegos pela suíte: o `notFound()` de
 * `/planos/[id]` passou a responder 200, porque o shell já tinha sido
 * transmitido; o `router.refresh()` do envio de foto trocava a página pelo
 * esqueleto no meio do fluxo e a foto não aparecia; e, com JavaScript
 * desligado, o esqueleto ficava preso na tela para sempre, porque a troca
 * depende do script que o React injeta — o que quebra a grade sem JavaScript
 * que o B7 testa de propósito.
 *
 * `useLinkStatus` é o que a documentação do Next indica para exatamente este
 * caso: rota dinâmica, sem `loading.js`. Ele é enriquecimento puro — sem
 * JavaScript não existe e nada muda; com JavaScript, o toque responde na hora.
 */
export function LinkPending({ className }: { className?: string }) {
  const { pending } = useLinkStatus();

  if (!pending) return null;

  return (
    <span
      aria-hidden="true"
      className={cn(
        "bg-accent absolute inset-x-0 top-0 h-0.5 origin-left rounded-full",
        /* A barra cresce sob reduced-motion também: aqui a animação **é** a
           informação, e não decoração (D-018). O que muda é a suavidade. */
        "animate-[link-pending_900ms_var(--ease-standard)_infinite]",
        className,
      )}
    />
  );
}
