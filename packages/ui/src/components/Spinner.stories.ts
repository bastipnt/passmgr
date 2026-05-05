import preview from "../../.storybook/preview";
import { Spinner } from "./Spinner";

const meta = preview.meta({
  title: "Design System/Atoms/Spinner",
  component: Spinner,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
});

export const Default = meta.story({});

export const Large = meta.story({ args: { className: "size-8" } });
