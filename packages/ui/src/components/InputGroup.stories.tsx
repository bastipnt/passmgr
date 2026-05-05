import preview from "../../.storybook/preview";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from "./InputGroup";
import { SearchIcon, MailIcon, EyeIcon } from "lucide-react";

const meta = preview.meta({
  title: "Design System/Atoms/InputGroup",
  component: InputGroup,
  subcomponents: {
    InputGroupAddon,
    InputGroupButton,
    InputGroupInput,
    InputGroupText,
    InputGroupTextarea,
  },
  parameters: { layout: "centered" },
  tags: ["autodocs"],
});

export const WithIcon = meta.story({
  render: () => (
    <InputGroup className="w-72">
      <InputGroupAddon>
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput placeholder="Search..." />
    </InputGroup>
  ),
});

export const WithText = meta.story({
  render: () => (
    <InputGroup className="w-72">
      <InputGroupAddon>
        <InputGroupText>https://</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput placeholder="example.com" />
    </InputGroup>
  ),
});

export const WithButton = meta.story({
  render: () => (
    <InputGroup className="w-72">
      <InputGroupAddon>
        <MailIcon />
      </InputGroupAddon>
      <InputGroupInput type="email" placeholder="you@example.com" />
      <InputGroupAddon align="inline-end">
        <InputGroupButton size="icon-xs" aria-label="Reveal">
          <EyeIcon />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  ),
});

export const WithTextarea = meta.story({
  render: () => (
    <InputGroup className="w-72">
      <InputGroupAddon align="block-start">
        <InputGroupText>Notes</InputGroupText>
      </InputGroupAddon>
      <InputGroupTextarea placeholder="Type your notes..." />
    </InputGroup>
  ),
});
