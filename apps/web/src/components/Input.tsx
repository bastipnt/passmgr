import React, { useId } from "react";
import styles from "./Input.module.css";
import { cn } from "@repo/util";

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
    <div className={styles.container}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <input
        ref={ref}
        id={id}
        name={name}
        aria-errormessage={errorId}
        className={cn(styles.input, error && styles.inputError, className)}
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
