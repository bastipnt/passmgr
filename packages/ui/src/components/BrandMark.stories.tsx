import preview from "../../.storybook/preview";
import { BrandLockup, BrandMark } from "./BrandMark";

const meta = preview.meta({
  title: "Design System/Atoms/BrandMark",
  component: BrandMark,
  subcomponents: { BrandLockup },
  parameters: { layout: "centered" },
  tags: ["autodocs"],
});

export const Mark = meta.story({});

export const Large = meta.story({
  args: { className: "size-16" },
});

export const Lockup = meta.story({
  render: () => <BrandLockup />,
});
