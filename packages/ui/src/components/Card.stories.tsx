import preview from "../../.storybook/preview";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./Card";
import { Button } from "./Button";

const meta = preview.meta({
  title: "Design System/Atoms/Card",
  component: Card,
  subcomponents: {
    CardHeader,
    CardTitle,
    CardDescription,
    CardAction,
    CardContent,
    CardFooter,
  },
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    size: { control: "select", options: ["default", "sm"] },
  },
  args: { size: "default" },
});

export const Default = meta.story({
  render: (args) => (
    <Card {...args} className="w-80">
      <CardHeader>
        <CardTitle>Account</CardTitle>
        <CardDescription>Manage your account settings.</CardDescription>
      </CardHeader>
      <CardContent>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</CardContent>
      <CardFooter>
        <Button>Save</Button>
      </CardFooter>
    </Card>
  ),
});

export const WithAction = meta.story({
  render: (args) => (
    <Card {...args} className="w-80">
      <CardHeader>
        <CardTitle>Project</CardTitle>
        <CardDescription>Acme Inc.</CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm">
            Edit
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>Pinned at top of dashboard.</CardContent>
    </Card>
  ),
});

export const Small = meta.story({
  args: { size: "sm" },
  render: (args) => (
    <Card {...args} className="w-72">
      <CardHeader>
        <CardTitle>Compact card</CardTitle>
      </CardHeader>
      <CardContent>Smaller padding and gaps.</CardContent>
    </Card>
  ),
});
