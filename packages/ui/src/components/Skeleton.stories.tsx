import preview from "../../.storybook/preview";
import { Skeleton } from "./Skeleton";

const meta = preview.meta({
  title: "Design System/Atoms/Skeleton",
  component: Skeleton,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
});

export const Default = meta.story({
  render: () => <Skeleton className="h-4 w-48" />,
});

export const Card = meta.story({
  render: () => (
    <div className="flex w-72 flex-col gap-3">
      <Skeleton className="h-32 w-full rounded-lg" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  ),
});

export const Avatar = meta.story({
  render: () => (
    <div className="flex items-center gap-3">
      <Skeleton className="size-10 rounded-full" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  ),
});
