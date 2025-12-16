import { useEffect } from "react";

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
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="bg-surface-4 fixed right-4 bottom-4 z-50 rounded-lg px-4 py-2 text-sm shadow-lg"
    >
      {message}
    </div>
  );
}
