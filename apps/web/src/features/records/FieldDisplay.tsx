import {
  type DetailFieldSpec,
  PREF_KEYS,
  REVEAL_TIMEOUT_DEFAULT_SECONDS,
  usePreference,
} from "@repo/client";
import {
  DetailBadge,
  DetailCodeBlock,
  DetailField,
  DetailStatus,
} from "@repo/ui/complex-components/DetailField";
import { buttonVariants } from "@repo/ui/components/Button";
import { ExternalLink } from "@repo/ui/components/ExternalLink";
import { FieldBoxHiddenMarker } from "@repo/ui/components/FieldBox";
import { cn } from "@repo/ui/lib/utils";
import { websiteLink } from "@repo/util";
import { ExternalLinkIcon } from "lucide-react";
import type { ReactNode } from "react";
import { shortcutHint } from "@/lib/formatShortcut";
import TotpField from "./login/TotpField";
import { RECORD_SHORTCUTS } from "./use-record-actions";

export type OnCopy = (value: string | undefined, label: string) => void;

type FieldDisplayProps = {
  spec: DetailFieldSpec;
  /** Omit to render the field without a copy action (a historical revision). */
  onCopy?: OnCopy;
  /** Show the copy shortcuts of the record on screen next to their fields. */
  showShortcuts?: boolean;
  /** Before the copy button (open a host); under it on a key block (download). */
  actions?: ReactNode;
  className?: string;
};

/**
 * Renders one field spec. The specs themselves are shared with mobile
 * (`@repo/client`), so everything web-specific — components, icons, copy
 * behaviour — lives here.
 */
export default function FieldDisplay({
  spec,
  onCopy,
  showShortcuts = false,
  actions,
  className,
}: FieldDisplayProps) {
  const [revealSeconds] = usePreference<number>(
    PREF_KEYS.revealTimeoutSeconds,
    REVEAL_TIMEOUT_DEFAULT_SECONDS,
  );
  const revealTimeoutMs = revealSeconds * 1_000;
  const copyValue = spec.copyValue ?? spec.value;
  const copy = onCopy && (() => onCopy(copyValue, spec.label));
  const shortcut = (key: keyof typeof RECORD_SHORTCUTS) =>
    showShortcuts ? shortcutHint(RECORD_SHORTCUTS[key]) : undefined;

  if (spec.block && spec.value) {
    return (
      <DetailCodeBlock
        label={spec.label}
        copyLabel={spec.label.toLowerCase()}
        onCopy={copy}
        concealable={spec.block === "blur"}
        revealTimeoutMs={revealTimeoutMs}
        actions={actions}
      >
        {spec.value}
      </DetailCodeBlock>
    );
  }

  const labelSuffix = (spec.hiddenMark || spec.badge) && (
    <>
      {spec.hiddenMark && <FieldBoxHiddenMarker />}
      {spec.badge && <DetailBadge>{spec.badge}</DetailBadge>}
    </>
  );
  const common = {
    className,
    label: spec.label,
    labelSuffix,
    value: spec.value,
    hint: spec.hint,
    valueClassName: spec.mono ? "font-mono text-[0.9rem]" : undefined,
    onCopy: copy,
    actions: (spec.status || actions) && (
      <>
        {spec.status && <DetailStatus tone={spec.status.tone}>{spec.status.label}</DetailStatus>}
        {actions}
      </>
    ),
  };

  switch (spec.kind) {
    case "title":
    case "text":
      return <DetailField {...common} />;

    case "username":
      return <DetailField {...common} shortcut={shortcut("copyUsername")} />;

    case "password":
    case "secret":
      return (
        <DetailField
          {...common}
          hidden
          maskedValue={spec.maskedValue}
          revealTimeoutMs={revealTimeoutMs}
          shortcut={spec.kind === "password" ? shortcut("copyPassword") : undefined}
        />
      );

    case "totp":
      return <TotpField onCopy={onCopy} totpData={spec.value ?? ""} />;

    case "websites":
      return (
        <DetailField
          className={className}
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
      return <DetailField {...common} multiline />;
  }
}

/** A link button among a field's actions that opens `href` in a new tab. */
export function OpenLink({ href, label }: { href: string; label: string }) {
  return (
    <ExternalLink
      href={href}
      aria-label={label}
      className={cn(
        buttonVariants({ variant: "ghost", size: "icon-sm" }),
        "text-muted-foreground no-underline",
      )}
    >
      <ExternalLinkIcon />
    </ExternalLink>
  );
}

export function WebsiteRow({ value, onCopy }: { value: string; onCopy?: OnCopy }) {
  const { text, href } = websiteLink(value);

  return (
    <DetailField
      value={text}
      copyLabel="website"
      onCopy={onCopy && (() => onCopy(value, "Website"))}
      actions={href && <OpenLink href={href} label={`Open ${text}`} />}
    />
  );
}
