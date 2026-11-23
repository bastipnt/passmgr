import preview from "../../.storybook/preview";
import { Button } from "./Button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./Sheet";

// The panel is the component: its props (`side`) are the story's args.
const meta = preview.meta({
  title: "Design System/Atoms/Sheet",
  component: SheetContent,
  subcomponents: {
    Sheet,
    SheetTrigger,
    SheetHeader,
    SheetTitle,
    SheetDescription,
    SheetFooter,
    SheetClose,
  },
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    side: { control: "select", options: ["top", "right", "bottom", "left"] },
  },
});

export const Default = meta.story({
  render: (args) => (
    <Sheet>
      <SheetTrigger>
        <Button variant="secondary">Open sheet</Button>
      </SheetTrigger>
      <SheetContent side={args.side ?? "right"}>
        <SheetHeader>
          <SheetTitle>Edit profile</SheetTitle>
          <SheetDescription>Make changes and save when done.</SheetDescription>
        </SheetHeader>
        <SheetFooter>
          <SheetClose>
            <Button>Save</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
});
