import { useEffect } from "react";
import styles from "./Toast.module.css";

type ToastProps = {
  message: string;
  isOpen: boolean;
  onClose: () => void;
  duration?: number;
};

export function Toast({ message, isOpen, onClose, duration = 3000 }: ToastProps) {
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [isOpen, onClose, duration]);

  if (!isOpen) return null;

  return (
    <div role="status" aria-live="polite" aria-atomic="true" className={styles.toast}>
      {message}
    </div>
  );
}
