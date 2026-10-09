import {
  type FieldSpec,
  PREF_KEYS,
  REVEAL_TIMEOUT_DEFAULT_SECONDS,
  usePreference,
} from "@repo/client";
import { getStrengthFromString } from "@repo/crypto";
import { RecordDetailsItem } from "@repo/ui-native";
import { Earth, Key, Lock, Mail, NotebookPen, NotebookText, Tag } from "lucide-react-native";
import { useCSSVariable } from "uniwind";
import TotpField from "./TotpField";

export type OnCopy = (value?: string) => void;

type LoginFieldDisplayProps = {
  spec: FieldSpec;
  /** Omit to render the field without a copy action, as the version diff does. */
  onCopy?: OnCopy;
};

/**
 * Renders one `FieldSpec`. The specs themselves are shared with web
 * (`@repo/client`), so everything native-specific — components, icons, copy
 * behaviour — lives here.
 */
export default function LoginFieldDisplay({ spec, onCopy }: LoginFieldDisplayProps) {
  const iconColor = useCSSVariable("--color-muted-foreground") as string;
  const [revealSeconds] = usePreference<number>(
    PREF_KEYS.revealTimeoutSeconds,
    REVEAL_TIMEOUT_DEFAULT_SECONDS,
  );
  const revealTimeoutMs = revealSeconds * 1_000;
  const copy = onCopy ? () => onCopy(spec.copyValue ?? spec.value) : undefined;

  switch (spec.kind) {
    case "title":
      return (
        <RecordDetailsItem
          icon={<Tag size={18} color={iconColor} />}
          title={spec.label}
          value={spec.value}
          variant="noAction"
        />
      );

    case "username":
      return (
        <RecordDetailsItem
          icon={<Mail size={18} color={iconColor} />}
          title={spec.label}
          value={spec.value}
          onCopy={copy}
        />
      );

    case "password":
      return (
        <RecordDetailsItem
          icon={<Key size={18} color={iconColor} />}
          title={spec.label}
          value={spec.value}
          variant={spec.value ? "password" : "noAction"}
          strength={spec.value ? getStrengthFromString(spec.value) : undefined}
          revealTimeoutMs={revealTimeoutMs}
          mono
          onCopy={copy}
        />
      );

    case "totp":
      return <TotpField onCopy={onCopy ?? (() => {})} totpData={spec.value ?? ""} />;

    case "websites":
      return (
        <RecordDetailsItem
          icon={<Earth size={18} color={iconColor} />}
          title={spec.label}
          value={spec.values}
          variant="websites"
        />
      );

    case "note":
      return (
        <RecordDetailsItem
          icon={<NotebookPen size={18} color={iconColor} />}
          title={spec.label}
          value={spec.value}
          onCopy={copy}
        />
      );

    case "text":
      return (
        <RecordDetailsItem
          icon={<NotebookText size={18} color={iconColor} />}
          title={spec.label}
          value={spec.value}
          onCopy={copy}
        />
      );

    case "secret":
      return (
        <RecordDetailsItem
          icon={<Lock size={18} color={iconColor} />}
          title={spec.label}
          value={spec.value}
          variant="hidden"
          revealTimeoutMs={revealTimeoutMs}
          mono
          onCopy={copy}
        />
      );
  }
}
