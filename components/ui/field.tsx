import {
  useId,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
  Children,
  isValidElement,
  type ReactNode,
} from "react";
import { type LucideIcon } from "lucide-react";
import { DateSelect, type SelectOption } from "@/components/ui/select";
import { cn } from "@/lib/cn";

type FieldProps = {
  label: string;
  error?: string;
  hint?: string;
  icon?: LucideIcon;
};

function FieldShell({
  label,
  error,
  hint,
  controlId,
  children,
}: FieldProps & { controlId: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <label
        id={controlId + "-label"}
        htmlFor={controlId}
        className="type-label text-text-muted"
      >
        {label}
      </label>
      {children}
      {error ? (
        <p id={controlId + "-error"} className="type-meta text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={controlId + "-hint"} className="type-meta text-text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Input({
  label,
  error,
  hint,
  icon: Icon,
  className,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & FieldProps) {
  const id = useId();
  return (
    <FieldShell label={label} error={error} hint={hint} controlId={id}>
      <div className="field-frame" data-invalid={!!error}>
        {Icon ? (
          <span className="field-icon">
            <Icon aria-hidden="true" className="size-4" strokeWidth={1.6} />
          </span>
        ) : null}
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            error ? id + "-error" : hint ? id + "-hint" : undefined
          }
          className={cn("field-control", className)}
          {...rest}
        />
      </div>
    </FieldShell>
  );
}

export function Textarea({
  label,
  error,
  hint,
  className,
  rows = 4,
  ...rest
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> & FieldProps) {
  const id = useId();
  return (
    <FieldShell label={label} error={error} hint={hint} controlId={id}>
      <div className="field-frame" data-invalid={!!error}>
        <textarea
          id={id}
          rows={rows}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            error ? id + "-error" : hint ? id + "-hint" : undefined
          }
          className={cn("field-control resize-y", className)}
          {...rest}
        />
      </div>
    </FieldShell>
  );
}

/** Adapta as opções declarativas ao Select DATE, sem select nativo visível. */
export function SelectField({
  label,
  error,
  hint,
  icon: Icon,
  className,
  children,
  defaultValue,
  ...rest
}: FieldProps & {
  name?: string;
  defaultValue?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  children: ReactNode;
  onValueChange?: (value: string) => void;
}) {
  const id = useId();
  const options: SelectOption[] = Children.toArray(children).flatMap(
    (child) => {
      if (
        !isValidElement<{
          value?: string;
          children?: ReactNode;
          disabled?: boolean;
        }>(child) ||
        child.type !== "option"
      )
        return [];
      return [
        {
          value: String(child.props.value ?? ""),
          label: String(child.props.children ?? ""),
          disabled: child.props.disabled,
        },
      ];
    },
  );
  return (
    <FieldShell label={label} error={error} hint={hint} controlId={id}>
      <DateSelect
        key={defaultValue}
        id={id}
        labelId={id + "-label"}
        descriptionId={error ? id + "-error" : hint ? id + "-hint" : undefined}
        invalid={!!error}
        options={options}
        defaultValue={defaultValue}
        className={className}
        icon={Icon ? <Icon className="size-4" strokeWidth={1.6} /> : undefined}
        {...rest}
      />
    </FieldShell>
  );
}
