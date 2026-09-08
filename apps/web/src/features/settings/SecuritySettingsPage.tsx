import {
  AUTO_LOCK_CHOICES,
  AUTO_LOCK_DEFAULT_MINUTES,
  CLIPBOARD_CLEAR_CHOICES,
  CLIPBOARD_CLEAR_DEFAULT_SECONDS,
  PREF_KEYS,
  type PreferenceChoice,
  REVEAL_TIMEOUT_CHOICES,
  REVEAL_TIMEOUT_DEFAULT_SECONDS,
  usePreference,
} from "@repo/client";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@repo/ui/components/Item";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/Select";

type ChoiceSettingProps = {
  title: string;
  description: string;
  choices: PreferenceChoice[];
  value: number;
  onValueChange: (value: number) => void;
};

function ChoiceSetting({ title, description, choices, value, onValueChange }: ChoiceSettingProps) {
  return (
    <Item variant="outline">
      <ItemContent className="gap-2">
        <ItemTitle>{title}</ItemTitle>
        <ItemDescription>{description}</ItemDescription>
        <Select
          items={choices}
          value={value}
          onValueChange={(next) => onValueChange(next as number)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {choices.map((choice) => (
                <SelectItem key={choice.value} value={choice.value}>
                  {choice.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </ItemContent>
    </Item>
  );
}

export default function SecuritySettingsPage() {
  const [clipboardClearSeconds, setClipboardClearSeconds] = usePreference<number>(
    PREF_KEYS.clipboardClearSeconds,
    CLIPBOARD_CLEAR_DEFAULT_SECONDS,
  );
  const [autoLockMinutes, setAutoLockMinutes] = usePreference<number>(
    PREF_KEYS.autoLockMinutes,
    AUTO_LOCK_DEFAULT_MINUTES,
  );
  const [revealTimeoutSeconds, setRevealTimeoutSeconds] = usePreference<number>(
    PREF_KEYS.revealTimeoutSeconds,
    REVEAL_TIMEOUT_DEFAULT_SECONDS,
  );

  return (
    <div className="p-4">
      <ItemGroup>
        <ChoiceSetting
          title="Clear clipboard"
          description="Only works while this tab stays focused — your browser will not let the app touch the clipboard in the background."
          choices={CLIPBOARD_CLEAR_CHOICES}
          value={clipboardClearSeconds}
          onValueChange={setClipboardClearSeconds}
        />

        <ChoiceSetting
          title="Lock when idle"
          description="Locking clears every key from memory. Anything you were editing but had not saved is lost."
          choices={AUTO_LOCK_CHOICES}
          value={autoLockMinutes}
          onValueChange={setAutoLockMinutes}
        />

        <ChoiceSetting
          title="Hide revealed values again"
          description="Applies to passwords and hidden custom fields after you reveal them."
          choices={REVEAL_TIMEOUT_CHOICES}
          value={revealTimeoutSeconds}
          onValueChange={setRevealTimeoutSeconds}
        />
      </ItemGroup>
    </div>
  );
}
