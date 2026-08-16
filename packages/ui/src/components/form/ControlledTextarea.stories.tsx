import { NotebookIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import preview from "../../../.storybook/preview";
import { ControlledTextarea } from "./ControlledTextarea";

const meta = preview.meta({
  title: "Design System/Form/ControlledTextarea",
  component: ControlledTextarea,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
});

function Wrapper(args: { label: string; defaultValue?: string; icon?: React.ReactNode }) {
  const { control } = useForm({ defaultValues: { field: args.defaultValue ?? "" } });
  return (
    <div className="w-72">
      <ControlledTextarea
        name="field"
        control={control}
        label={args.label}
        icon={args.icon}
        placeholder="Type your notes..."
      />
    </div>
  );
}

export const Default = meta.story({
  render: () => <Wrapper label="Notes" />,
});

export const WithIcon = meta.story({
  render: () => <Wrapper label="Notes" icon={<NotebookIcon />} />,
});
