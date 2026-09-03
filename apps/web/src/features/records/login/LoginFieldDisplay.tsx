import type { LoginFieldSpec } from "@repo/client";
import { getStrengthFromString } from "@repo/crypto";
import { ItemDisplay } from "@repo/ui/complex-components/ItemDisplay";
import Link from "@repo/ui/components/Link";
import {
  EarthIcon,
  KeyIcon,
  LockIcon,
  MailIcon,
  NotebookPenIcon,
  TagIcon,
  TextIcon,
} from "lucide-react";
import TotpField from "./TotpField";

export type OnCopy = (value: string | undefined, label: string) => void;

/** Historical revisions are read-only, so their fields render without a copy action. */
const noCopy: OnCopy = () => {};

type LoginFieldDisplayProps = {
  spec: LoginFieldSpec;
  /** Omit to render the field without a copy action. */
  onCopy?: OnCopy;
};

/**
 * Renders one `LoginFieldSpec`. The specs themselves are shared with mobile
 * (`@repo/client`), so everything web-specific — components, icons, copy
 * behaviour — lives here.
 */
export default function LoginFieldDisplay({ spec, onCopy = noCopy }: LoginFieldDisplayProps) {
  switch (spec.kind) {
    case "title":
      return (
        <ItemDisplay title={spec.label} value={spec.value} onClick={() => {}} icon={<TagIcon />} />
      );

    case "username":
      return (
        <ItemDisplay
          title={spec.label}
          value={spec.value}
          onClick={() => onCopy(spec.value, spec.label)}
          icon={<MailIcon />}
        />
      );

    case "password":
      return (
        <ItemDisplay
          title={spec.label}
          value={spec.value}
          onClick={({ type }) => type === "copy" && onCopy(spec.value, spec.label)}
          icon={<KeyIcon />}
          variant={spec.value ? "password" : "noAction"}
          strength={spec.value ? getStrengthFromString(spec.value) : undefined}
        />
      );

    case "totp":
      return <TotpField onCopy={onCopy} totpData={spec.value ?? ""} />;

    case "websites":
      return (
        <ItemDisplay
          title={spec.label}
          value={
            <ul>
              {spec.values?.map((value, i) => (
                <li key={i}>
                  <Link target="_blank" href={value} className="p-0">
                    {value}
                  </Link>
                </li>
              ))}
            </ul>
          }
          onClick={() => {}}
          icon={<EarthIcon />}
          variant="noAction"
        />
      );

    case "note":
      return (
        <ItemDisplay
          title={spec.label}
          value={<span className="wrap-break-word whitespace-pre-line">{spec.value}</span>}
          onClick={() => {}}
          icon={<NotebookPenIcon />}
          variant="noAction"
        />
      );

    case "extra-text":
    case "extra-secret":
      return (
        <ItemDisplay
          title={spec.label}
          value={spec.value}
          onClick={({ type }) => type === "copy" && onCopy(spec.value, spec.label)}
          icon={spec.kind === "extra-secret" ? <LockIcon /> : <TextIcon />}
          variant={spec.kind === "extra-secret" ? "hidden" : "default"}
        />
      );
  }
}
