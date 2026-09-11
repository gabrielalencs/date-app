import { Check } from "lucide-react";

import { cn } from "@/lib/cn";
import {
  statusHasIcon,
  statusLabel,
  statusTone,
  type PlanStatus,
} from "@/lib/status";

const TONE_CLASSES = {
  muted: "text-text-muted",
  neutral: "text-text",
  dot: "text-text",
  positive: "text-text",
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
      className={cn(
        // w-fit para a pill não esticar quando o pai é um flex column.
        "bg-surface-sunken inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1",
        "type-label",
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
