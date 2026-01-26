import React, { useId } from "react";
import { cn } from "../utils/tailwind";

export interface InputProps extends Omit<React.ButtonHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, error, name, label, ...props },
  ref,
) {
  const id = useId();
  const errorId = useId();

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-content-secondary block">
        {label}
      </label>
      <input
        ref={ref}
        id={id}
        name={name}
        aria-errormessage={errorId}
        className={cn(
          "w-full rounded border bg-transparent p-2",
          "focus:ring-primary-900 focus:ring-2 focus:outline-none",
          error && "ring-error-line focus:ring-error-line border-error-line ring-1 focus:ring-2",
        )}
        {...props}
      />
      {error && (
        <p id={errorId} className="text-error-content text-sm">
          {error}
        </p>
      )}
    </div>
  );
});

export default Input;
