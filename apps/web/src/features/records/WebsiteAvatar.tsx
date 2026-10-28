import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/Avatar";
import { hueTint } from "@repo/ui/lib/hue-tint";
import { cn } from "@repo/ui/lib/utils";
import { useWebsiteAvatar } from "@repo/ui-shared";

type Website = { value: string };

type WebsiteAvatarProps = {
  title: string;
  websites: Website[] | undefined;
  className?: string;
  size?: "default" | "md" | "ml" | "header" | "lg" | "xl";
};

const SIZES = {
  default: {
    tile: "size-9 rounded-[10px] bg-white p-1.5 after:rounded-[10px]",
    fallback: "-m-1.5 size-9 rounded-[10px] font-semibold",
  },
  md: {
    tile: "size-[2.625rem] rounded-xl bg-white p-2 after:rounded-xl",
    fallback: "-m-2 size-[2.625rem] rounded-xl font-semibold text-lg",
  },
  ml: {
    tile: "size-12 rounded-[13px] bg-white p-2 after:rounded-[13px]",
    fallback: "-m-2 size-12 rounded-[13px] font-bold font-display text-xl",
  },
  header: {
    tile: "size-13 rounded-[14px] bg-white p-2.5 after:rounded-[14px]",
    fallback: "-m-2.5 size-13 rounded-[14px] font-bold font-display text-2xl",
  },
  lg: {
    tile: "size-14 rounded-2xl bg-white p-2.5 after:rounded-2xl",
    fallback: "-m-2.5 size-14 rounded-2xl font-bold font-display text-2xl",
  },
  xl: {
    tile: "size-16 rounded-[1.125rem] bg-white p-3.5 after:rounded-[1.125rem]",
    fallback: "-m-3.5 size-16 rounded-[1.125rem] font-bold font-display text-3xl",
  },
} as const;

/** Site favicon on a white rounded tile, or a hue-tinted initial. */
export function WebsiteAvatar({
  title,
  websites,
  className,
  size = "default",
}: WebsiteAvatarProps) {
  const { hue, src, status } = useWebsiteAvatar({ title, websites });
  const { tile, fallback } = SIZES[size];

  return (
    <Avatar className={cn(tile, className)}>
      {status === "ok" && src && <AvatarImage src={src} className="rounded-sm" />}
      <AvatarFallback style={hueTint(hue)} className={fallback}>
        {title.charAt(0)}
      </AvatarFallback>
    </Avatar>
  );
}
