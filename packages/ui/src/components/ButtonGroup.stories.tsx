import preview from "../../.storybook/preview";
import { Button } from "./Button";
import { ButtonGroup, ButtonGroupSeparator, ButtonGroupText } from "./ButtonGroup";

const meta = preview.meta({
  title: "Design System/Atoms/ButtonGroup",
  component: ButtonGroup,
  subcomponents: { ButtonGroupSeparator, ButtonGroupText },
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    orientation: { control: "select", options: ["horizontal", "vertical"] },
  },
  args: { orientation: "horizontal" },
});

export const Horizontal = meta.story({
  render: (args) => (
    <ButtonGroup {...args}>
      <Button variant="secondary">Left</Button>
      <Button variant="secondary">Middle</Button>
      <Button variant="secondary">Right</Button>
    </ButtonGroup>
  ),
});

export const Vertical = meta.story({
  args: { orientation: "vertical" },
  render: (args) => (
    <ButtonGroup {...args}>
      <Button variant="secondary">Top</Button>
      <Button variant="secondary">Middle</Button>
      <Button variant="secondary">Bottom</Button>
    </ButtonGroup>
  ),
});

export const WithSeparator = meta.story({
  render: (args) => (
    <ButtonGroup {...args}>
      <Button variant="secondary">One</Button>
      <ButtonGroupSeparator />
      <Button variant="secondary">Two</Button>
    </ButtonGroup>
  ),
});

export const WithText = meta.story({
  render: (args) => (
    <ButtonGroup {...args}>
      <ButtonGroupText>Page</ButtonGroupText>
      <Button variant="secondary">1</Button>
      <Button variant="secondary">2</Button>
      <Button variant="secondary">3</Button>
    </ButtonGroup>
  ),
});
