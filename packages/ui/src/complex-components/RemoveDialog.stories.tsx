import { Button } from "@repo/ui/components/Button";
import { fn } from "storybook/test";
import preview from "../../.storybook/preview";
import RemoveDialog from "./RemoveDialog";

const meta = preview.meta({
  title: "Design System/Complex/RemoveDialog",
  component: RemoveDialog,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  args: {
    title: "Remove entry",
    description: "This will permanently remove the entry. You cannot undo this.",
    removeTitle: "Remove",
    open: undefined,
    onRemove: fn(),
    onOpenChange: undefined,
  },
});

export const Default = meta.story({
  render: ({ title, description, removeTitle, removeVariant, onRemove }) => (
    <RemoveDialog
      title={title}
      description={description}
      removeTitle={removeTitle}
      removeVariant={removeVariant}
      onRemove={onRemove}
    >
      <Button variant="destructive">Remove</Button>
    </RemoveDialog>
  ),
});
