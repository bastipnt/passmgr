export type StatusTone = "success" | "warning" | "destructive" | "neutral";

/** Text color of a status word ("· Off", "Added"): the meaning colors, never the accent. */
export const toneTextClassName: Record<StatusTone, string> = {
  success: "text-emerald-700 dark:text-success",
  warning: "text-amber-700 dark:text-warning",
  destructive: "text-destructive",
  neutral: "text-muted-foreground",
};

/** An icon tile in a status color (a warning event, a synced vault); neutral is the plain muted tile. */
export const toneTileClassName: Record<StatusTone, string> = {
  success: "bg-success/15 text-emerald-800 dark:text-success",
  warning: "bg-warning/15 text-amber-800 dark:text-warning",
  destructive: "bg-destructive/12 text-destructive",
  neutral: "bg-muted text-primary-text",
};
