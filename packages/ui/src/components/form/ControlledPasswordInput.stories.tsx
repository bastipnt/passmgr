import preview from "../../../.storybook/preview";
import { ControlledPasswordInput } from "./ControlledPasswordInput";
import { useForm } from "react-hook-form";

const meta = preview.meta({
  title: "Design System/Form/ControlledPasswordInput",
  component: ControlledPasswordInput,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
});

function Wrapper(args: { defaultValue?: string }) {
  const { control } = useForm({ defaultValues: { password: args.defaultValue ?? "" } });
  return (
    <div className="w-72">
      <ControlledPasswordInput
        name="password"
        control={control}
        label="Password"
        placeholder="Enter password"
      />
    </div>
  );
}

export const Default = meta.story({ render: () => <Wrapper /> });

export const WithValue = meta.story({ render: () => <Wrapper defaultValue="hunter2" /> });
