import { DEMO_VAULT_NOTICE } from "@repo/client";
import { Note } from "@repo/ui/components/Note";
import { FlaskConicalIcon } from "lucide-react";

/** Where an account or sync would be offered: this vault can't have either. */
export default function DemoVaultNotice() {
  return (
    <Note tone="warning" icon={<FlaskConicalIcon />}>
      <strong className="font-semibold">Demo vault.</strong> {DEMO_VAULT_NOTICE}
    </Note>
  );
}
