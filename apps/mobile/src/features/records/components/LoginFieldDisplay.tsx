import type { LoginFieldSpec } from "@repo/client";
import { RecordDetailsItem } from "@repo/ui-native";
import { Earth, Key, Lock, Mail, NotebookPen, NotebookText, Tag } from "lucide-react-native";
import { useCSSVariable } from "uniwind";
import TotpField from "./TotpField";

export type OnCopy = (value?: string) => void;

type LoginFieldDisplayProps = {
  spec: LoginFieldSpec;
  /** Omit to render the field without a copy action, as the version diff does. */
  onCopy?: OnCopy;
};

/**
 * Renders one `LoginFieldSpec`. The specs themselves are shared with web
 * (`@repo/client`), so everything native-specific — components, icons, copy
 * behaviour — lives here.
 */
export default function LoginFieldDisplay({ spec, onCopy }: LoginFieldDisplayProps) {
  const iconColor = useCSSVariable("--color-muted-foreground") as string;
  const copy = onCopy ? () => onCopy(spec.value) : undefined;

  switch (spec.kind) {
    case "title":
      return (
        <RecordDetailsItem
          icon={<Tag size={20} color={iconColor} />}
          title={spec.label}
          value={spec.value}
          variant="noAction"
        />
      );

    case "username":
      return (
        <RecordDetailsItem
          icon={<Mail size={20} color={iconColor} />}
          title={spec.label}
          value={spec.value}
          onCopy={copy}
        />
      );

    case "password":
      return (
        <RecordDetailsItem
          icon={<Key size={20} color={iconColor} />}
          title={spec.label}
          value={spec.value}
          variant="password"
          onCopy={copy}
        />
      );

    case "totp":
      return <TotpField onCopy={onCopy ?? (() => {})} totpData={spec.value ?? ""} />;

    case "websites":
      return (
        <RecordDetailsItem
          icon={<Earth size={20} color={iconColor} />}
          title={spec.label}
          value={spec.values}
          variant="websites"
        />
      );

    case "note":
      return (
        <RecordDetailsItem
          icon={<NotebookPen size={20} color={iconColor} />}
          title={spec.label}
          value={spec.value}
          onCopy={copy}
        />
      );

    case "extra-text":
      return (
        <RecordDetailsItem
          icon={<NotebookText size={20} color={iconColor} />}
          title={spec.label}
          value={spec.value}
          onCopy={copy}
        />
      );

    case "extra-secret":
      return (
        <RecordDetailsItem
          icon={<Lock size={20} color={iconColor} />}
          title={spec.label}
          value={spec.value}
          variant="hidden"
          onCopy={copy}
        />
      );
  }
}
