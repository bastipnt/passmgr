import preview from "../../.storybook/preview";
import { Toaster } from "./Toaster";
import { Button } from "./Button";
import { toast } from "sonner";

const meta = preview.meta({
  title: "Design System/Atoms/Toaster",
  component: Toaster,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
});

export const Default = meta.story({
  render: () => (
    <>
      <div className="flex gap-2">
        <Button onClick={() => toast.success("Saved")}>Success</Button>
        <Button variant="secondary" onClick={() => toast.info("Heads up")}>
          Info
        </Button>
        <Button variant="secondary" onClick={() => toast.warning("Careful")}>
          Warning
        </Button>
        <Button variant="destructive" onClick={() => toast.error("Failed")}>
          Error
        </Button>
      </div>
      <Toaster />
    </>
  ),
});
