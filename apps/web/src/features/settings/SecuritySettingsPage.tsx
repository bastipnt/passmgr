import {
  AUTO_LOCK_PREFERENCE,
  type ChoicePreference,
  CLIPBOARD_CLEAR_PREFERENCE,
  REVEAL_TIMEOUT_PREFERENCE,
  useChoicePreference,
  useWebsiteIconsPreference,
} from "@repo/client";
import Link from "@repo/ui/components/Link";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { WEBSITE_ICONS_HINT } from "@repo/ui-shared";
import { settingsPaths } from "@/app/route-paths";
import { SettingsChoiceRow } from "./SettingsChoiceRow";
import { SettingsGroup } from "./SettingsGroup";
import { SettingsPage } from "./SettingsPage";
import { SettingsRow, SettingsSwitch } from "./SettingsRow";

const LOCK_HINT = "Locking clears every key from memory. Unsaved edits are lost.";
const CLIPBOARD_HINT =
  "Works only while this tab is in front. Browsers block the clipboard in the background.";
const REVEAL_HINT = "Passwords and hidden fields cover up again after you reveal them.";

function ChoiceSetting({
  label,
  hint,
  preference,
}: {
  label: string;
  hint: string;
  preference: ChoicePreference;
}) {
  const [value, setValue] = useChoicePreference(preference);
  return (
    <SettingsChoiceRow
      label={label}
      hint={hint}
      choices={preference.choices}
      value={value}
      onValueChange={setValue}
      shortLabel={(text) => text.replace(/^After /, "")}
    />
  );
}

function AccountHint() {
  const isMobile = useIsMobile();
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      {isMobile ? (
        <SettingsRow
          label="Two-factor and password"
          hint="These live under Account"
          href={settingsPaths.account}
        />
      ) : (
        <SettingsRow
          label="Looking for two-factor or your password?"
          hint="Sign-in settings live under Account."
          control={
            <Link variant="outline" href={settingsPaths.account}>
              Go to Account
            </Link>
          }
        />
      )}
    </div>
  );
}

/** How long secrets stay unlocked and visible on this device, and what the app fetches for them. */
export default function SecuritySettingsPage() {
  const isMobile = useIsMobile();
  const [websiteIcons, setWebsiteIcons] = useWebsiteIconsPreference();

  return (
    <SettingsPage
      title="Security"
      description="How long secrets stay unlocked and visible on this device."
    >
      <SettingsGroup label="Locking" footnote={isMobile ? LOCK_HINT : undefined}>
        <ChoiceSetting label="Lock when idle" hint={LOCK_HINT} preference={AUTO_LOCK_PREFERENCE} />
      </SettingsGroup>
      <SettingsGroup
        label="Secrets on screen"
        footnote={
          isMobile
            ? "Clearing works only while this tab is in front. Revealed passwords and hidden fields cover up again after the delay."
            : undefined
        }
      >
        <ChoiceSetting
          label="Clear clipboard"
          hint={CLIPBOARD_HINT}
          preference={CLIPBOARD_CLEAR_PREFERENCE}
        />
        <ChoiceSetting
          label="Hide revealed values"
          hint={REVEAL_HINT}
          preference={REVEAL_TIMEOUT_PREFERENCE}
        />
      </SettingsGroup>
      <SettingsGroup label="Privacy" footnote={isMobile ? WEBSITE_ICONS_HINT : undefined}>
        <SettingsRow
          label="Show website icons"
          hint={isMobile ? undefined : WEBSITE_ICONS_HINT}
          control={<SettingsSwitch checked={websiteIcons} onCheckedChange={setWebsiteIcons} />}
        />
      </SettingsGroup>
      <AccountHint />
    </SettingsPage>
  );
}
