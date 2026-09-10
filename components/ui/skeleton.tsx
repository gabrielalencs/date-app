import { cn } from "@/lib/cn";

/**
 * Pulso sutil de opacidade: feedback funcional é exceção à proibição de loop
 * (D-018). Sob prefers-reduced-motion a regra global zera a animação, deixando
 * o bloco estático — não rodando o loop uma vez.
 */
const SHAPES = {
  line: "h-4 w-full rounded-sm",
  block: "h-24 w-full rounded-md",
  media: "aspect-4/5 w-full rounded-lg",
} as const;

export function Skeleton({
  shape = "line",
  className,
}: {
  shape?: keyof typeof SHAPES;
  className?: string;
}) {
  return (
    <div
      role="presentation"
      className={cn(
        "bg-surface-sunken animate-[skeleton-pulse_1.6s_var(--ease-standard)_infinite]",
        SHAPES[shape],
        className,
      )}
    />
  );
}
