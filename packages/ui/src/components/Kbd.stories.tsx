import preview from "../../.storybook/preview";
import { Kbd, KbdGroup } from "./Kbd";

const meta = preview.meta({
  title: "Design System/Atoms/Kbd",
  component: Kbd,
  subcomponents: { KbdGroup },
  parameters: { layout: "centered" },
  tags: ["autodocs"],
});

export const Single = meta.story({
  render: () => <Kbd>Esc</Kbd>,
});

export const Group = meta.story({
  render: () => (
    <KbdGroup>
      <Kbd>⌘</Kbd>
      <Kbd>K</Kbd>
    </KbdGroup>
  ),
});
