import { Check } from "lucide-react";

import { cn } from "@/lib/cn";
import {
  statusHasIcon,
  statusLabel,
  statusTone,
  type PlanStatus,
} from "@/lib/status";

const TONE_CLASSES = {
  muted: "bg-surface-sunken text-text-muted",
  neutral: "bg-mist-soft text-text",
  dot: "bg-blush-soft text-text",
  positive: "bg-sage-soft text-text",
} as const;

const DOT_CLASSES = {
  muted: null,
  neutral: null,
  dot: "bg-accent",
  positive: "bg-positive",
} as const;

export function StatusPill({
  status,
  className,
}: {
  status: PlanStatus;
  className?: string;
}) {
  const tone = statusTone(status);
  const dot = DOT_CLASSES[tone];

  return (
    <span
      /* O rótulo é ambíguo para teste e para leitor automático: "Decidindo"
         também é o nome de um botão de transição. O status cru resolve. */
      data-status={status}
      className={cn(
        // w-fit para a pill não esticar quando o pai é um flex column.
        "inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1",
        "text-xs leading-relaxed font-medium",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {statusHasIcon(status) ? (
        <Check aria-hidden="true" className="text-positive size-3" />
      ) : dot ? (
        <span aria-hidden="true" className={cn("size-1.5 rounded-full", dot)} />
      ) : null}
      {statusLabel(status)}
    </span>
  );
}
