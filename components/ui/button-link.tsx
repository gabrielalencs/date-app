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

/** Mesma aparência do Button, mas navega. Evita o Slot do Radix. */
export function ButtonLink({
  variant,
  size,
  fullWidth,
  className,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link
      className={cn(buttonClasses({ variant, size, fullWidth }), className)}
      {...rest}
    />
  );
}
