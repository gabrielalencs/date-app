import { cn } from "@/lib/cn";

/**
 * O rótulo é sempre `--text`: coral e sage não têm contraste para 12px.
 * A cor entra como ponto, nunca como único portador de significado.
 */
const DOTS = {
  neutral: null,
  accent: "bg-accent",
  positive: "bg-positive",
} as const;

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: keyof typeof DOTS;
  children: string;
  className?: string;
}) {
  const dot = DOTS[tone];

  return (
    <span
      className={cn(
        "bg-surface-sunken inline-flex items-center gap-1.5 rounded-full px-2.5 py-1",
        "type-label text-text",
        className,
      )}
    >
      {dot ? (
        <span aria-hidden="true" className={cn("size-1.5 rounded-full", dot)} />
      ) : null}
      {children}
    </span>
  );
}
