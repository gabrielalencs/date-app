"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

/**
 * Radix cuida de foco, escape, portal e trava de scroll. A aparência é toda
 * nossa: o Radix não traz vocabulário de cor, então não há token para remapear.
 */
export function SheetContent({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[var(--scrim)] data-[state=open]:animate-[fade-in_var(--duration-standard)_var(--ease-standard)]" />
      <DialogPrimitive.Content
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col gap-4",
          "border-border-subtle bg-surface rounded-t-lg border-t p-5",
          "pb-[calc(1.25rem+env(safe-area-inset-bottom))]",
          "shadow-[var(--shadow-overlay)]",
          "data-[state=open]:animate-[sheet-in_var(--duration-enter)_var(--ease-enter)]",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <DialogPrimitive.Title className="type-title text-text">
              {title}
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="type-body-s text-text-muted">
                {description}
              </DialogPrimitive.Description>
            ) : null}
          </div>
          <DialogPrimitive.Close
            aria-label="Fechar"
            className="text-text hover:bg-surface-sunken inline-grid size-11 shrink-0 place-items-center rounded-md transition-opacity duration-[var(--duration-micro)]"
          >
            <X aria-hidden="true" className="size-5" />
          </DialogPrimitive.Close>
        </div>
        <div className="overflow-y-auto">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
