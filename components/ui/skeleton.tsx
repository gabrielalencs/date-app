import { cn } from "@/lib/cn";

/**
 * Estático de propósito: a seção 9 proíbe animação em loop, então não há pulse.
 * Contradição com "respeita reduced-motion" da tabela da seção 6 reportada ao
 * proprietário — sem animação, a preferência é respeitada trivialmente.
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
      className={cn("bg-surface-sunken", SHAPES[shape], className)}
    />
  );
}
