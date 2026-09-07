import { PREF_KEYS, usePreference } from "@repo/client";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@repo/ui/components/Item";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/Select";

type Choice = { label: string; value: number };

const clipboardChoices: Choice[] = [
  { label: "Never", value: 0 },
  { label: "After 15 seconds", value: 15 },
  { label: "After 30 seconds", value: 30 },
  { label: "After 1 minute", value: 60 },
];

const autoLockChoices: Choice[] = [
  { label: "Never", value: 0 },
  { label: "After 1 minute", value: 1 },
  { label: "After 5 minutes", value: 5 },
  { label: "After 15 minutes", value: 15 },
  { label: "After 30 minutes", value: 30 },
];

const revealChoices: Choice[] = [
  { label: "Never", value: 0 },
  { label: "After 10 seconds", value: 10 },
  { label: "After 30 seconds", value: 30 },
];

type ChoiceSettingProps = {
  title: string;
  description: string;
  choices: Choice[];
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
    0,
  );
  const [autoLockMinutes, setAutoLockMinutes] = usePreference<number>(PREF_KEYS.autoLockMinutes, 0);
  const [revealTimeoutSeconds, setRevealTimeoutSeconds] = usePreference<number>(
    PREF_KEYS.revealTimeoutSeconds,
    0,
  );

  return (
    <div className="p-4">
      <ItemGroup>
        <ChoiceSetting
          title="Clear clipboard"
          description="Only works while this tab stays focused — your browser will not let the app touch the clipboard in the background."
          choices={clipboardChoices}
          value={clipboardClearSeconds}
          onValueChange={setClipboardClearSeconds}
        />

        <ChoiceSetting
          title="Lock when idle"
          description="Locking clears every key from memory. Anything you were editing but had not saved is lost."
          choices={autoLockChoices}
          value={autoLockMinutes}
          onValueChange={setAutoLockMinutes}
        />

        <ChoiceSetting
          title="Hide revealed values again"
          description="Applies to passwords and hidden custom fields after you reveal them."
          choices={revealChoices}
          value={revealTimeoutSeconds}
          onValueChange={setRevealTimeoutSeconds}
        />
      </ItemGroup>
    </div>
  );
}
