import { forwardRef, useId, type InputHTMLAttributes } from "react";
import { cn } from "../../cn";

// TextField — a labelled single-line input (slice 7, the lead form). A native <input> with its
// <label>: native semantics, keyboard and autofill; nothing hand-rolled.
//
// - The hint and the error are tied to the input by aria-describedby; an error also sets
//   aria-invalid. The error text is the muted status colour (AA on the light surfaces; ADR-0005).
// - The border is the field's only boundary (white on Mist is ~1.1:1), so it is the muted ink,
//   which clears WCAG 1.4.11's 3:1 on both white and Mist.
// - Tokens only. The field sits on a light surface (the modal's Mist), on a white fill.

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label: string;
  /** Guidance under the field, e.g. the phone format. */
  hint?: string;
  /** The validation message, or null/undefined when the value is fine. */
  error?: string | null;
  className?: string;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, className, id: idProp, required, ...props },
  ref,
) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-fg text-sm font-medium">
        {label}
        {required ? (
          <span aria-hidden="true" className="text-fg-muted">
            {" *"}
          </span>
        ) : null}
      </label>
      <input
        ref={ref}
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          "bg-surface-white text-on-white placeholder:text-on-white-muted focus-visible:ring-focus-ring h-12 w-full rounded-md border px-3.5 text-base focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50",
          error ? "border-error" : "border-fg-muted",
        )}
        {...props}
      />
      {hint ? (
        <p id={hintId} className="text-fg-muted text-xs">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-error text-xs font-medium">
          {error}
        </p>
      ) : null}
    </div>
  );
});
