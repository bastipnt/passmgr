import {
  AUTO_LOCK_PREFERENCE,
  type ChoicePreference,
  CLIPBOARD_CLEAR_PREFERENCE,
  REVEAL_TIMEOUT_PREFERENCE,
  useChoicePreference,
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
import { useId } from "react";
import { PanelHeader, PanelTitle } from "@/components/AppShell";

type ChoiceSettingProps = {
  title: string;
  description: string;
  preference: ChoicePreference;
};

function ChoiceSetting({ title, description, preference }: ChoiceSettingProps) {
  const titleId = useId();
  const [value, onValueChange] = useChoicePreference(preference);
  const { choices } = preference;
  return (
    <Item variant="outline">
      <ItemContent className="gap-2">
        <ItemTitle id={titleId}>{title}</ItemTitle>
        <ItemDescription>{description}</ItemDescription>
        <Select
          items={choices}
          value={value}
          onValueChange={(next) => onValueChange(next as number)}
        >
          <SelectTrigger className="w-full" aria-labelledby={titleId}>
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
  return (
    <>
      <PanelHeader>
        <PanelTitle>Security</PanelTitle>
      </PanelHeader>
      <div className="px-4 pb-4">
        <ItemGroup>
          <ChoiceSetting
            title="Clear clipboard"
            description="Only works while this tab stays focused — your browser will not let the app touch the clipboard in the background."
            preference={CLIPBOARD_CLEAR_PREFERENCE}
          />

          <ChoiceSetting
            title="Lock when idle"
            description="Locking clears every key from memory. Anything you were editing but had not saved is lost."
            preference={AUTO_LOCK_PREFERENCE}
          />

          <ChoiceSetting
            title="Hide revealed values again"
            description="Applies to passwords and hidden custom fields after you reveal them."
            preference={REVEAL_TIMEOUT_PREFERENCE}
          />
        </ItemGroup>
      </div>
    </>
  );
}
