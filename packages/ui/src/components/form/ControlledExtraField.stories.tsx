import preview from "../../../.storybook/preview";
import { ControlledExtraField } from "./ControlledExtraField";
import { useForm } from "react-hook-form";
import { KeyIcon } from "lucide-react";

const meta = preview.meta({
  title: "Design System/Form/ControlledExtraField",
  component: ControlledExtraField,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
});

function Wrapper(args: { type?: "text" | "secret"; icon?: React.ReactNode }) {
  const { control } = useForm({ defaultValues: { title: "", value: "" } });
  return (
    <div className="w-80">
      <ControlledExtraField
        control={control}
        titleName="title"
        valueName="value"
        type={args.type}
        icon={args.icon}
      />
    </div>
  );
}

export const Default = meta.story({ render: () => <Wrapper /> });

export const Secret = meta.story({ render: () => <Wrapper type="secret" /> });

export const WithIcon = meta.story({ render: () => <Wrapper icon={<KeyIcon />} /> });
