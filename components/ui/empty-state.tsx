import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-surface-sunken flex flex-col items-center gap-4 rounded-lg px-6 py-12 text-center",
        className,
      )}
    >
      <Icon aria-hidden="true" className="text-text-muted size-6" />
      <div className="flex flex-col gap-2">
        <p className="type-title text-text">{title}</p>
        <p className="type-body-s text-text-muted mx-auto max-w-[36ch]">
          {description}
        </p>
      </div>
      {action}
    </div>
  );
}
