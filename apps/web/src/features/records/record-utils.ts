import { toast } from "@repo/ui";

export function copyField(value: string | undefined, label: string) {
  if (!value) return;
  void navigator.clipboard.writeText(value);
  toast.success(`${label} copied to clipboard`);
}
