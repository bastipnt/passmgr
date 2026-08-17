import { Field, FieldLabel } from "@repo/ui/components/Field";
import { Switch } from "@repo/ui/components/Switch";

type OptionToggleProps = {
  id: string;
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
};

export default function OptionToggle({ id, label, checked, onChange }: OptionToggleProps) {
  return (
    <Field orientation="horizontal">
      <FieldLabel htmlFor={id} className="flex-1">
        {label}
      </FieldLabel>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </Field>
  );
}
