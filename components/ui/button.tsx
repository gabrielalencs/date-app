import type { ButtonHTMLAttributes } from "react";

import {
  buttonClasses,
  type ButtonSize,
  type ButtonVariant,
} from "@/lib/button-variants";
import { cn } from "@/lib/cn";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  /** Rótulo que substitui o conteúdo enquanto carrega. Sem spinner: loop é proibido. */
  loadingLabel?: string;
};

export function Button({
  variant,
  size,
  loading = false,
  fullWidth,
  loadingLabel,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cn(
        buttonClasses({ variant, size, loading, fullWidth }),
        className,
      )}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && loadingLabel ? loadingLabel : children}
    </button>
  );
}
