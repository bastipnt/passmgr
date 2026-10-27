import { WandSparklesIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import preview from "../../../.storybook/preview";
import { FieldBox, FieldBoxButton, FieldBoxInput } from "../FieldBox";
import { ControlledBoxedInput } from "./ControlledBoxedInput";
import { ControlledBoxedSelect } from "./ControlledBoxedSelect";
import { ControlledBoxedToggle } from "./ControlledBoxedToggle";
import { FormLock } from "./FormLock";

const meta = preview.meta({
  title: "Design System/Form/Boxed fields",
  component: FieldBox,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
});

const SECURITY_OPTIONS = [
  { value: "wpa2", label: "WPA2" },
  { value: "wpa3", label: "WPA3" },
  { value: "none", label: "None" },
];

type Values = {
  title: string;
  username: string;
  email: string;
  phone: string;
  postalCode: string;
  keyId: string;
  pin: string;
  birthDate: string;
  security?: string;
  hidden: boolean;
};

const DEFAULTS: Values = {
  title: "Home Wi-Fi",
  username: "quietlantern",
  email: "",
  phone: "+49 151 2345 6789",
  postalCode: "10999",
  keyId: "pk_live_51Hx…Qz7",
  pin: "4821",
  birthDate: "1991-04-03",
  security: "wpa2",
  hidden: false,
};

function Fields({ invalid = false, locked = false }: { invalid?: boolean; locked?: boolean }) {
  const { control } = useForm<Values>({
    defaultValues: DEFAULTS,
    errors: invalid
      ? {
          title: { type: "required", message: "Enter a title" },
          birthDate: { type: "pattern", message: "Use YYYY-MM-DD" },
          security: { type: "required", message: "Pick the security" },
        }
      : undefined,
  });

  return (
    <FormLock locked={locked}>
      <div className="grid w-full max-w-2xl gap-2.5 sm:grid-cols-2">
        <ControlledBoxedInput
          control={control}
          name="title"
          label="Title"
          className="sm:col-span-2"
        />
        <ControlledBoxedInput control={control} name="username" label="Username" />
        <ControlledBoxedInput
          control={control}
          name="email"
          label="Email"
          type="email"
          placeholder="name@example.com"
        />
        <ControlledBoxedInput control={control} name="phone" label="Phone" type="tel" />
        <ControlledBoxedInput
          control={control}
          name="postalCode"
          label="Postal code"
          inputMode="numeric"
        />
        <ControlledBoxedInput control={control} name="keyId" label="Key ID" mono />
        <ControlledBoxedInput
          control={control}
          name="pin"
          label="PIN"
          secret
          trailing={
            <FieldBoxButton aria-label="Generate PIN">
              <WandSparklesIcon />
            </FieldBoxButton>
          }
        />
        <ControlledBoxedInput control={control} name="birthDate" label="Birth date" type="date" />
        <ControlledBoxedSelect
          control={control}
          name="security"
          label="Security"
          options={SECURITY_OPTIONS}
        />
        <ControlledBoxedToggle
          control={control}
          name="hidden"
          label="Hidden network"
          description="The network doesn't broadcast its name"
          className="sm:col-span-2"
        />
      </div>
    </FormLock>
  );
}

export const AllVariants = meta.story({
  render: () => <Fields />,
});

export const Invalid = meta.story({
  render: () => <Fields invalid />,
});

export const Locked = meta.story({
  render: () => <Fields locked />,
});

export const Bare = meta.story({
  name: "FieldBox (bare)",
  render: () => (
    <div className="max-w-md">
      <FieldBox label="Note title" htmlFor="bare">
        <FieldBoxInput id="bare" placeholder="Add a title…" />
      </FieldBox>
    </div>
  ),
});
