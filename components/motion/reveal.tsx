import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Entrada de um grupo editorial: fade com 8px de deslocamento.
 *
 * Era `motion/react`. A troca por CSS tirou 131 kB de JavaScript de **toda**
 * rota — o pacote inteiro vinha para animar isto e o dropdown do Select — e de
 * quebra este componente deixou de precisar de `"use client"`: agora é Server
 * Component e não manda nada para o navegador (D-166).
 */
export function Reveal({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("reveal", className)}>{children}</div>;
}
