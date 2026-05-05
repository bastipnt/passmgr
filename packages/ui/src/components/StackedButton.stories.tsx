import preview from "../../.storybook/preview";
import { StackedButton } from "./StackedButton";
import { Button } from "./Button";
import { EyeIcon } from "lucide-react";

const meta = preview.meta({
  title: "Design System/Atoms/StackedButton",
  component: StackedButton,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
});

export const Default = meta.story({
  render: () => (
    <div className="w-72 rounded-lg border">
      <StackedButton>
        <Button variant="ghost" className="w-full justify-start">
          Click to copy password
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Reveal">
          <EyeIcon />
        </Button>
      </StackedButton>
    </div>
  ),
});
