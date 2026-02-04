/**
 * Utility function for combining class names
 * Simplified version without Tailwind merge
 */
export function cn(...inputs: (string | undefined | null | false)[]) {
  return inputs.filter(Boolean).join(" ");
}
