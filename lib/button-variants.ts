import { cn } from "@/lib/cn";

export type ButtonVariant =
  "primary" | "accent" | "secondary" | "outline" | "ghost" | "danger";
export type ButtonSize = "md" | "sm";

/** Variantes de preenchimento sólido, com foreground próprio por tema. */
export function isFilledVariant(variant: ButtonVariant): boolean {
  return variant === "primary" || variant === "accent";
}

/**
 * D-017: rótulo branco sobre coral só a partir de 19px semibold, então botão
 * accent não tem tamanho pequeno. Primary navy permite o tamanho sm.
 */
export function resolveButtonSize(
  variant: ButtonVariant,
  size: ButtonSize = "md",
): ButtonSize {
  return variant === "accent" ? "md" : size;
}

const BASE =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md " +
  "transition-[opacity,transform] duration-[var(--duration-micro)] ease-standard " +
  "motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";

const SIZES: Record<ButtonSize, string> = {
  md: "min-h-12 px-5 text-base font-medium",
  sm: "px-3 text-sm font-medium",
};

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand text-brand-fg hover:bg-brand-hover",
  accent: "bg-accent text-accent-fg hover:bg-accent-hover",
  secondary:
    "border border-border-subtle bg-surface-sunken text-text hover:bg-taupe-soft",
  outline:
    "border border-border-strong bg-surface text-text hover:bg-mist-soft",
  ghost: "bg-transparent text-text hover:bg-surface-sunken",
  danger: "border border-danger bg-surface text-danger hover:bg-blush-soft",
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
    variant === "accent" && "text-[1.1875rem] font-semibold",
    options.fullWidth && "w-full",
    options.loading && "pointer-events-none opacity-70",
  );
}
