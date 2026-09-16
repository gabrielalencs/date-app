import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** `media` reserva o topo para foto; `flat` é o padrão. */
  variant?: "flat" | "media";
  interactive?: boolean;
};

export function Card({
  variant = "flat",
  interactive = false,
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={cn(
        "border-border-subtle bg-surface overflow-hidden rounded-lg border",
        interactive &&
          "ease-standard hover:border-border-strong cursor-pointer transition-[opacity,transform] duration-[var(--duration-micro)] active:scale-[0.99]",
        variant === "media" && "flex flex-col",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/**
 * Slot de foto. Enquanto não existir mídia real (B5), fica com o fundo
 * `--surface-sunken` que serve também de placeholder de carregamento.
 */
export function CardMedia({
  ratio = "4/5",
  children,
  className,
}: {
  ratio?: "4/5" | "16/9" | "1/1";
  children?: ReactNode;
  className?: string;
}) {
  const ratioClass = {
    "4/5": "aspect-4/5",
    "16/9": "aspect-video",
    "1/1": "aspect-square",
  }[ratio];

  return (
    <div
      className={cn(
        "bg-surface-sunken w-full max-w-full",
        ratioClass,
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardBody({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-2 p-4", className)}>{children}</div>
  );
}
