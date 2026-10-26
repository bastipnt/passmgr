import { hueTint } from "@repo/ui/lib/hue-tint";
import { cn } from "@repo/ui/lib/utils";
import { HardDriveIcon } from "lucide-react";

type ProfileAvatarProps = {
  email?: string;
  /** The profile's own colour (`profileHue`); the accent where there is no profile yet. */
  hue?: number;
};

export function ProfileAvatar({ email, hue }: ProfileAvatarProps) {
  return (
    <span
      aria-hidden
      style={hue === undefined ? undefined : hueTint(hue)}
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-xl font-bold font-display text-lg",
        hue === undefined && "bg-primary text-primary-foreground",
      )}
    >
      {email ? email.charAt(0).toUpperCase() : <HardDriveIcon className="size-5" />}
    </span>
  );
}
