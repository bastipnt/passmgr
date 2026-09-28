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

/** Rounded glass panel: the scrollbar only shows on hover and stays clear of the corners. */
export const RoundedPanel = meta.story({
  render: () => (
    <ScrollArea className="glass h-80 w-72 rounded-[28px] [--scroll-area-inset:28px]">
      <div className="sticky-bar px-5 pt-4 pb-2 font-semibold">Header</div>
      <div className="flex flex-col gap-2 px-5 pb-5 text-sm">
        {Array.from({ length: 40 }).map((_, i) => (
          <div key={i}>Row {i + 1}</div>
        ))}
      </div>
    </ScrollArea>
  ),
});
