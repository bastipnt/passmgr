import { EyeOffIcon } from "lucide-react";
import type { ReactNode } from "react";
import AuthNote from "./AuthNote";

export default function PrivateWindowNote({ children }: { children: ReactNode }) {
  return (
    <AuthNote tone="warning" icon={<EyeOffIcon />}>
      {children}
    </AuthNote>
  );
}
