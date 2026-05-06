import preview from "../../.storybook/preview";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "./Select";

const meta = preview.meta({
  title: "Design System/Atoms/Select",
  component: Select,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
});

export const Default = meta.story({
  render: () => (
    <Select>
      <SelectTrigger className="w-48">
        <SelectValue placeholder="Select a fruit" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="apple">Apple</SelectItem>
        <SelectItem value="banana">Banana</SelectItem>
        <SelectItem value="blueberry">Blueberry</SelectItem>
        <SelectItem value="grape">Grape</SelectItem>
        <SelectItem value="pineapple">Pineapple</SelectItem>
      </SelectContent>
    </Select>
  ),
});

export const Small = meta.story({
  render: () => (
    <Select>
      <SelectTrigger size="sm" className="w-48">
        <SelectValue placeholder="Pick size" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="xs">Extra small</SelectItem>
        <SelectItem value="sm">Small</SelectItem>
        <SelectItem value="md">Medium</SelectItem>
        <SelectItem value="lg">Large</SelectItem>
      </SelectContent>
    </Select>
  ),
});

export const WithGroups = meta.story({
  render: () => (
    <Select>
      <SelectTrigger className="w-56">
        <SelectValue placeholder="Select a timezone" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>North America</SelectLabel>
          <SelectItem value="est">Eastern Standard Time</SelectItem>
          <SelectItem value="cst">Central Standard Time</SelectItem>
          <SelectItem value="pst">Pacific Standard Time</SelectItem>
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>Europe</SelectLabel>
          <SelectItem value="cet">Central European Time</SelectItem>
          <SelectItem value="gmt">Greenwich Mean Time</SelectItem>
          <SelectItem value="msk">Moscow Time</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  ),
});

export const WithDefaultValue = meta.story({
  render: () => (
    <Select defaultValue="banana">
      <SelectTrigger className="w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="apple">Apple</SelectItem>
        <SelectItem value="banana">Banana</SelectItem>
        <SelectItem value="grape">Grape</SelectItem>
      </SelectContent>
    </Select>
  ),
});

export const Disabled = meta.story({
  render: () => (
    <Select disabled>
      <SelectTrigger className="w-48">
        <SelectValue placeholder="Disabled" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="a">A</SelectItem>
        <SelectItem value="b">B</SelectItem>
      </SelectContent>
    </Select>
  ),
});

export const Scrollable = meta.story({
  render: () => (
    <Select>
      <SelectTrigger className="w-48">
        <SelectValue placeholder="Pick a number" />
      </SelectTrigger>
      <SelectContent position="popper" className="max-h-60">
        {Array.from({ length: 50 }, (_, i) => (
          <SelectItem key={i} value={`item-${i}`}>
            Item {i + 1}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  ),
});
