import preview from "../../../.storybook/preview";
import { ControlledInput } from "./ControlledInput";
import { useForm } from "react-hook-form";
import { MailIcon } from "lucide-react";

const meta = preview.meta({
  title: "Design System/Form/ControlledInput",
  component: ControlledInput,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
});

function Wrapper(args: { label: string; defaultValue?: string; icon?: React.ReactNode }) {
  const { control } = useForm({ defaultValues: { field: args.defaultValue ?? "" } });
  return (
    <div className="w-72">
      <ControlledInput
        name="field"
        control={control}
        label={args.label}
        icon={args.icon}
        placeholder="Type here..."
      />
    </div>
  );
}

export const Default = meta.story({
  render: () => <Wrapper label="Username" />,
});

export const WithIcon = meta.story({
  render: () => <Wrapper label="Email" icon={<MailIcon />} />,
});

export const WithValue = meta.story({
  render: () => <Wrapper label="Username" defaultValue="bastian" />,
});
