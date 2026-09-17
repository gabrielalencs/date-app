import Link from "next/link";
import type { ComponentProps } from "react";

import {
  buttonClasses,
  type ButtonSize,
  type ButtonVariant,
} from "@/lib/button-variants";
import { cn } from "@/lib/cn";

type ButtonLinkProps = ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
};

/**
 * Mesma aparência do Button, mas navega. Evita o Slot do Radix.
 *
 * `prefetch` nasce desligado. Toda rota deste produto é dinâmica e pessoal:
 * pré-buscar é pedir ao servidor uma renderização completa, com resolução de
 * contexto e consultas ao banco, por um destino que a pessoa talvez não visite.
 * Medido: abrir a Home disparava 13 dessas. O toque já responde na hora pelo
 * `useLinkStatus`, que não custa servidor nenhum.
 *
 * Quem tiver um caso em que valha a pena passa `prefetch` explicitamente — o
 * padrão é o que muda, não a possibilidade.
 */
export function ButtonLink({
  variant,
  size,
  fullWidth,
  className,
  prefetch = false,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link
      prefetch={prefetch}
      className={cn(buttonClasses({ variant, size, fullWidth }), className)}
      {...rest}
    />
  );
}
