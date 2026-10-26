import {
  type FieldSpec,
  PREF_KEYS,
  REVEAL_TIMEOUT_DEFAULT_SECONDS,
  usePreference,
} from "@repo/client";
import { DetailField } from "@repo/ui/complex-components/DetailField";
import { buttonVariants } from "@repo/ui/components/Button";
import { cn } from "@repo/ui/lib/utils";
import { websiteLink } from "@repo/util";
import { ExternalLinkIcon } from "lucide-react";
import { shortcutHint } from "@/lib/formatShortcut";
import { RECORD_SHORTCUTS } from "../use-record-actions";
import TotpField from "./TotpField";

export type OnCopy = (value: string | undefined, label: string) => void;

type LoginFieldDisplayProps = {
  spec: FieldSpec;
  /** Omit to render the field without a copy action (a historical revision). */
  onCopy?: OnCopy;
  /** Show the copy shortcuts of the record on screen next to their fields. */
  showShortcuts?: boolean;
};

/**
 * Renders one `FieldSpec`. The specs themselves are shared with mobile
 * (`@repo/client`), so everything web-specific — components, icons, copy
 * behaviour — lives here.
 */
export default function LoginFieldDisplay({
  spec,
  onCopy,
  showShortcuts = false,
}: LoginFieldDisplayProps) {
  const [revealSeconds] = usePreference<number>(
    PREF_KEYS.revealTimeoutSeconds,
    REVEAL_TIMEOUT_DEFAULT_SECONDS,
  );
  const revealTimeoutMs = revealSeconds * 1_000;
  const copy = (value: string | undefined) => onCopy && (() => onCopy(value, spec.label));

  switch (spec.kind) {
    case "title":
    case "text":
      return (
        <DetailField
          label={spec.label}
          value={spec.value}
          onCopy={copy(spec.copyValue ?? spec.value)}
        />
      );

    case "username":
      return (
        <DetailField
          label={spec.label}
          value={spec.value}
          onCopy={copy(spec.value)}
          shortcut={showShortcuts ? shortcutHint(RECORD_SHORTCUTS.copyUsername) : undefined}
        />
      );

    case "password":
      return (
        <DetailField
          label={spec.label}
          value={spec.value}
          hidden
          revealTimeoutMs={revealTimeoutMs}
          onCopy={copy(spec.value)}
          shortcut={showShortcuts ? shortcutHint(RECORD_SHORTCUTS.copyPassword) : undefined}
        />
      );

    case "secret":
      return (
        <DetailField
          label={spec.label}
          value={spec.value}
          hidden
          revealTimeoutMs={revealTimeoutMs}
          onCopy={copy(spec.copyValue ?? spec.value)}
        />
      );

    case "totp":
      return <TotpField onCopy={onCopy} totpData={spec.value ?? ""} />;

    case "websites":
      return (
        <DetailField
          label={spec.label}
          value={
            <ul>
              {spec.values?.map((value, i) => (
                <li key={i}>{websiteLink(value).text}</li>
              ))}
            </ul>
          }
          multiline
        />
      );

    case "note":
      return (
        <DetailField label={spec.label} value={spec.value} multiline onCopy={copy(spec.value)} />
      );
  }
}

export function WebsiteRow({ value, onCopy }: { value: string; onCopy?: OnCopy }) {
  const { text, href } = websiteLink(value);

  return (
    <DetailField
      value={text}
      copyLabel="website"
      onCopy={onCopy && (() => onCopy(value, "Website"))}
      actions={
        href && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${text}`}
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon-sm" }),
              "text-muted-foreground",
            )}
          >
            <ExternalLinkIcon />
          </a>
        )
      }
    />
  );
}
