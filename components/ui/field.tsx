import {
  useId,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

import { cn } from "@/lib/cn";

const CONTROL =
  "w-full min-h-11 rounded-sm border bg-surface px-3 py-2 type-body text-text " +
  "placeholder:text-text-muted transition-[opacity] duration-[var(--duration-micro)] " +
  "disabled:cursor-not-allowed disabled:opacity-50";

type FieldShellProps = {
  label: string;
  error?: string;
  hint?: string;
  controlId: string;
  children: React.ReactNode;
};

function FieldShell({
  label,
  error,
  hint,
  controlId,
  children,
}: FieldShellProps) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={controlId} className="type-label text-text-muted">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${controlId}-error`} className="type-meta text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${controlId}-hint`} className="type-meta text-text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  label: string;
  error?: string;
  hint?: string;
};

export function Input({ label, error, hint, className, ...rest }: InputProps) {
  const id = useId();

  return (
    <FieldShell label={label} error={error} hint={hint} controlId={id}>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          error ? `${id}-error` : hint ? `${id}-hint` : undefined
        }
        className={cn(
          CONTROL,
          error ? "border-danger" : "border-border-strong",
          className,
        )}
        {...rest}
      />
    </FieldShell>
  );
}

type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> & {
  label: string;
  error?: string;
  hint?: string;
};

export function Textarea({
  label,
  error,
  hint,
  className,
  rows = 4,
  ...rest
}: TextareaProps) {
  const id = useId();

  return (
    <FieldShell label={label} error={error} hint={hint} controlId={id}>
      <textarea
        id={id}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          error ? `${id}-error` : hint ? `${id}-hint` : undefined
        }
        className={cn(
          CONTROL,
          "resize-y",
          error ? "border-danger" : "border-border-strong",
          className,
        )}
        {...rest}
      />
    </FieldShell>
  );
}
