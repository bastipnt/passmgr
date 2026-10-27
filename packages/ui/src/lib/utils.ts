import { type ClassValue, clsx } from "clsx";
import type { Ref } from "react";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Both react-hook-form (`setFocus`) and the caller get the input element. */
export function mergeRefs<T>(...refs: (Ref<T> | undefined)[]) {
  return (element: T | null) => {
    for (const ref of refs) {
      if (typeof ref === "function") ref(element);
      else if (ref) ref.current = element;
    }
  };
}
