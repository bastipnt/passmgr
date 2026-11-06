import { Note } from "@repo/ui/components/Note";
import { EyeOffIcon } from "lucide-react";
import type { ReactNode } from "react";

export default function PrivateWindowNote({ children }: { children: ReactNode }) {
  return (
    <Note tone="warning" icon={<EyeOffIcon />}>
      {children}
    </Note>
  );
}
