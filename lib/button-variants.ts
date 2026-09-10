import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "md" | "sm";

/** Variantes de preenchimento sólido, onde o rótulo é branco sobre cor. */
export function isFilledVariant(variant: ButtonVariant): boolean {
  return variant === "primary" || variant === "danger";
}

/**
 * D-017: rótulo branco sobre coral só a partir de 19px semibold, então botão
 * preenchido não tem tamanho pequeno. Pedir `sm` num preenchido é ignorado.
 */
export function resolveButtonSize(
  variant: ButtonVariant,
  size: ButtonSize = "md",
): ButtonSize {
  return isFilledVariant(variant) ? "md" : size;
}

const BASE =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md " +
  "transition-[opacity,transform] duration-[var(--duration-micro)] ease-standard " +
  "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";

const SIZES: Record<ButtonSize, string> = {
  // 19px/600 é o piso do rótulo sobre preenchimento coral.
  md: "px-5 text-[1.1875rem] font-semibold",
  sm: "px-3 text-sm font-medium",
};

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent-hover",
  secondary:
    "border border-border-strong bg-surface text-text hover:bg-surface-sunken",
  ghost: "bg-transparent text-text hover:bg-surface-sunken",
  danger: "bg-danger text-accent-fg hover:opacity-90",
};

export function buttonClasses(options: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
}): string {
  const variant = options.variant ?? "primary";
  const size = resolveButtonSize(variant, options.size);

  return cn(
    BASE,
    SIZES[size],
    VARIANTS[variant],
    options.fullWidth && "w-full",
    options.loading && "pointer-events-none opacity-70",
  );
}
