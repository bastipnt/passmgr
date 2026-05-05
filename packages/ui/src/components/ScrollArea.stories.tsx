import preview from "../../.storybook/preview";
import { ScrollArea } from "./ScrollArea";

const meta = preview.meta({
  title: "Design System/Atoms/ScrollArea",
  component: ScrollArea,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
});

export const Vertical = meta.story({
  render: () => (
    <ScrollArea className="h-48 w-64 rounded-lg border p-3">
      <div className="flex flex-col gap-2 text-sm">
        {Array.from({ length: 30 }).map((_, i) => (
          <div key={i}>Row {i + 1}</div>
        ))}
      </div>
    </ScrollArea>
  ),
});
