// fallow-ignore-file unused-file
import { useShortcutContext } from "@repo/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/Dialog";
import { Kbd, KbdGroup } from "@repo/ui/components/Kbd";

import { formatShortcut } from "@/lib/formatShortcut";

type ShortcutsHelpDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function ShortcutsHelpDialog({ open, onOpenChange }: ShortcutsHelpDialogProps) {
  const { shortcuts } = useShortcutContext();
  const visible = shortcuts.filter((s) => s.description);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>
            Press <Kbd>?</Kbd> anytime to open this list.
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-2">
          {visible.map((s) => (
            <li key={s.key} className="flex items-center justify-between gap-4">
              <span className="text-sm">{s.description}</span>
              <KbdGroup>
                {formatShortcut(s.key).map((token, i) => (
                  <Kbd key={i}>{token}</Kbd>
                ))}
              </KbdGroup>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
