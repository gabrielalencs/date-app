import { cn } from "@/lib/cn";

export type ButtonVariant =
  "primary" | "accent" | "secondary" | "outline" | "ghost" | "danger";
export type ButtonSize = "md" | "sm";

/** Variantes de preenchimento sólido, com foreground próprio por tema. */
export function isFilledVariant(variant: ButtonVariant): boolean {
  return variant === "primary" || variant === "accent";
}

/**
 * D-017, corrigido no B11: rótulo branco sobre coral rende 3.09:1, que só é
 * suficiente como **texto grande** — e a WCAG conta como negrito o peso 700,
 * não o 600 do semibold. O botão accent é 19px em 700, e por isso continua sem
 * tamanho pequeno. Primary navy permite o tamanho sm (D-136).
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

/* Sem peso aqui: quem define o peso é a linha única abaixo. Emitir
   `font-medium` no tamanho e `font-bold` na variante deixava os dois no mesmo
   elemento, e a cascata do Tailwind resolvia a favor do `font-medium` — o botão
   coral saía em 500 e o axe reprovava por contraste de texto pequeno. */
const SIZES: Record<ButtonSize, string> = {
  md: "min-h-12 px-5 text-base",
  sm: "px-3 text-sm",
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
    variant === "accent" ? "text-[1.1875rem] font-bold" : "font-medium",
    options.fullWidth && "w-full",
    options.loading && "pointer-events-none opacity-70",
  );
}
