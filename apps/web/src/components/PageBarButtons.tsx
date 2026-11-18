import { Button } from "@repo/ui/components/Button";
import { ChevronLeftIcon, XIcon } from "lucide-react";

/** "‹ Settings": a pushed phone page's way back to its list (`usePageBack`). */
export function BackToButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="lg"
      className="-ml-3 gap-0.5 px-2 font-medium text-primary-text"
      aria-label={`Back to ${label}`}
      onClick={onClick}
    >
      <ChevronLeftIcon className="size-5.5" />
      {label}
    </Button>
  );
}

/** Top right of a phone overlay's first page. */
export function CloseButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      variant="floating"
      size="icon-xl"
      className="ml-auto"
      aria-label={label}
      onClick={onClick}
    >
      <XIcon className="size-5" />
    </Button>
  );
}
