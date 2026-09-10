import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

type IconButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> & {
  /** Obrigatório: o ícone sozinho não comunica nada a leitor de tela. */
  label: string;
  variant?: "ghost" | "solid";
  icon: ReactNode;
};

const VARIANTS = {
  ghost: "bg-transparent text-text hover:bg-surface-sunken",
  solid: "bg-accent text-accent-fg hover:bg-accent-hover",
} as const;

export function IconButton({
  label,
  variant = "ghost",
  icon,
  className,
  ...rest
}: IconButtonProps) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cn(
        "inline-grid size-11 place-items-center rounded-md",
        "ease-standard transition-[opacity,transform] duration-[var(--duration-micro)]",
        "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      <span aria-hidden="true" className="grid place-items-center">
        {icon}
      </span>
    </button>
  );
}
