"use client";

import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type SelectOption = { value: string; label: string; disabled?: boolean };
const EMPTY_VALUE = "__date_empty__";

export function DateSelect({
  id,
  labelId,
  descriptionId,
  invalid,
  name,
  defaultValue,
  options,
  disabled,
  required,
  icon,
  className,
  onValueChange,
}: {
  id: string;
  labelId: string;
  descriptionId?: string;
  invalid?: boolean;
  name?: string;
  defaultValue?: string;
  options: SelectOption[];
  disabled?: boolean;
  required?: boolean;
  icon?: ReactNode;
  className?: string;
  onValueChange?: (value: string) => void;
}) {
  const initialValue = defaultValue ?? options[0]?.value ?? "";
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    const form = inputRef.current?.form;
    const reset = () => setValue(initialValue);
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, [initialValue]);

  return (
    <Select.Root
      value={value || EMPTY_VALUE}
      disabled={disabled}
      required={required}
      onValueChange={(next) => {
        const actual = next === EMPTY_VALUE ? "" : next;
        setValue(actual);
        onValueChange?.(actual);
      }}
    >
      {/* O valor vazio dos filtros permanece vazio no GET/Server Action. */}
      <input
        ref={inputRef}
        type="hidden"
        name={name}
        value={value}
        disabled={disabled}
      />
      <Select.Trigger
        id={id}
        aria-labelledby={labelId}
        aria-describedby={descriptionId}
        aria-invalid={invalid || undefined}
        className={cn(
          "field-frame min-h-[3.25rem] w-full text-left disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        data-invalid={!!invalid}
      >
        {icon ? (
          <span className="field-icon" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <span className="min-w-0 flex-1 truncate px-4 text-base">
          <Select.Value />
        </span>
        <Select.Icon className="text-text-muted pr-4">
          <ChevronDown className="size-4" aria-hidden="true" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={8}
          collisionPadding={12}
          className="border-border-strong bg-surface text-text shadow-raised z-50 w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-24px)] overflow-hidden rounded-md border"
        >
          <motion.div
            data-date-select-motion
            initial={{ opacity: 0, y: reduce ? 0 : -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? 0.1 : 0.18 }}
          >
            <Select.ScrollUpButton className="grid min-h-11 place-items-center">
              <ChevronUp className="size-4" />
            </Select.ScrollUpButton>
            <Select.Viewport className="max-h-[min(20rem,var(--radix-select-content-available-height))] p-1.5">
              {options.map((option) => (
                <Select.Item
                  key={option.value}
                  value={option.value || EMPTY_VALUE}
                  disabled={option.disabled}
                  textValue={option.label}
                  className="data-[highlighted]:bg-mist-soft relative flex min-h-11 cursor-pointer items-center gap-3 rounded-sm py-3 pr-10 pl-3 text-sm data-[disabled]:pointer-events-none data-[disabled]:opacity-45 data-[state=checked]:font-semibold"
                >
                  <Select.ItemText>{option.label}</Select.ItemText>
                  <Select.ItemIndicator className="absolute right-3">
                    <Check aria-hidden="true" className="size-4" />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
            <Select.ScrollDownButton className="grid min-h-11 place-items-center">
              <ChevronDown className="size-4" />
            </Select.ScrollDownButton>
          </motion.div>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
