import React, { useId } from "react";
import styles from "./Input.module.css";
import { cn } from "@repo/util";

export interface InputProps extends Omit<React.ButtonHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  placeholder?: string;
  error?: string;
  hideLabel?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, error, name, label, hideLabel, placeholder, ...props },
  ref,
) {
  const id = useId();
  const errorId = useId();

  return (
    <div className={styles.container}>
      {!hideLabel && (
        <label htmlFor={id} className={styles.label}>
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={id}
        name={name}
        aria-errormessage={errorId}
        className={cn(styles.input, error && styles.inputError, className)}
        placeholder={placeholder}
        {...props}
      />
      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
});

export default Input;
