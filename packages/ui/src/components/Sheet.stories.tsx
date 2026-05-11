import preview from "../../.storybook/preview";
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
import { Button } from "./Button";

const meta = preview.meta({
  title: "Design System/Atoms/Sheet",
  component: Sheet,
  subcomponents: {
    SheetTrigger,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
    SheetFooter,
    SheetClose,
  },
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    // @ts-expect-error takes types from Sheet, but side is defined on SheetContent
    side: { control: "select", options: ["top", "right", "bottom", "left"] },
  },
});

export const Default = meta.story({
  render: (args) => (
    <Sheet>
      <SheetTrigger>
        <Button variant="secondary">Open sheet</Button>
      </SheetTrigger>
      {/* @ts-expect-error takes types from Sheet, but side is defined on SheetContent */}
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
