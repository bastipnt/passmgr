import { copyToClipboard, ownFingerprint } from "@repo/client";
import { toast } from "@repo/ui";
import { Button } from "@repo/ui/components/Button";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { useMemo } from "react";
import { webClipboard } from "@/lib/clipboard";
import { SettingsGroup } from "./SettingsGroup";
import { SettingsRow } from "./SettingsRow";

const HINT =
  "People who share a vault with you see this code for you. Read it to them so they know the vault key reaches you and nobody else.";

/** The user's own key fingerprint, to read out to the people they share with. Online only. */
export function SecurityCodeCard() {
  const isMobile = useIsMobile();
  const fingerprint = useMemo(() => ownFingerprint(), []);
  if (!fingerprint) return null;

  // Public and meant to be passed on: no auto-clear, unlike a secret's copy.
  const onCopy = async () => {
    if (await copyToClipboard(webClipboard, fingerprint, 0)) toast.success("Security code copied");
    else toast.error("The code couldn't be copied.");
  };
  const groups = fingerprint.split(" ");
  const half = Math.ceil(groups.length / 2);

  return (
    <SettingsGroup label="Your security code">
      {isMobile ? (
        <div className="flex flex-col gap-3 p-4">
          <code className="block py-2 text-center font-mono text-[17px] leading-7 tracking-[0.06em]">
            {groups.slice(0, half).join(" ")}
            <br />
            {groups.slice(half).join(" ")}
          </code>
          <p className="text-[13px] text-muted-foreground leading-4.5">{HINT}</p>
          <Button variant="outline" onClick={() => void onCopy()}>
            Copy code
          </Button>
        </div>
      ) : (
        <SettingsRow
          className="py-4"
          label={<code className="font-mono text-[15px] tracking-[0.04em]">{fingerprint}</code>}
          hint={HINT}
          control={
            <Button variant="outline" onClick={() => void onCopy()}>
              Copy
            </Button>
          }
        />
      )}
    </SettingsGroup>
  );
}
