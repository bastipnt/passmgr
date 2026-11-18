export type StatusTone = "success" | "warning" | "destructive" | "neutral";

/** Text color of a status word ("· Off", "Added"): the meaning colors, never the accent. */
export const toneTextClassName: Record<StatusTone, string> = {
  success: "text-emerald-700 dark:text-success",
  warning: "text-amber-700 dark:text-warning",
  destructive: "text-destructive",
  neutral: "text-muted-foreground",
};
