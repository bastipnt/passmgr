import { Button } from "@repo/ui/components/Button";
import { createHandle, DialogTrigger } from "@repo/ui/components/Dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@repo/ui/components/Tooltip";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { cn } from "@repo/ui/lib/utils";
import { WandSparklesIcon } from "lucide-react";
import { useMemo } from "react";
import PasswordGenerator from "./PasswordGenerator";

type GeneratePasswordButtonProps = {
  onUse: (password: string) => void;
  /** What it fills, for the button's name: "Generate <field>". */
  fieldLabel: string;
  /** `icon`: a round button without the text, for tight rows (always so on phones). */
  size?: "default" | "icon";
  className?: string;
};

/** An accent-tinted pill opening the generator with the saved defaults. */
export default function GeneratePasswordButton({
  onUse,
  fieldLabel,
  size = "default",
  className,
}: GeneratePasswordButtonProps) {
  const handle = useMemo(() => createHandle(), []);
  const isMobile = useIsMobile();
  const iconOnly = size === "icon" || isMobile;
  const name = `Generate ${fieldLabel.toLowerCase()}`;

  return (
    <>
      <Tooltip disabled={!iconOnly}>
        <TooltipTrigger
          render={
            <DialogTrigger
              handle={handle}
              render={
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={name}
                  className={cn(
                    "rounded-full bg-primary/10 text-primary-text hover:bg-primary/16 hover:text-primary-text aria-expanded:bg-primary/16 aria-expanded:text-primary-text dark:aria-expanded:bg-primary/16 dark:hover:bg-primary/16",
                    iconOnly
                      ? "size-10 md:size-[30px] [&_svg:not([class*='size-'])]:size-3.5"
                      : "h-10 gap-1.5 px-3.5 text-[0.8rem] md:h-8 md:px-3 [&_svg:not([class*='size-'])]:size-3.5",
                    className,
                  )}
                >
                  <WandSparklesIcon />
                  {!iconOnly && "Generate"}
                </Button>
              }
            />
          }
        />
        <TooltipContent>{name}</TooltipContent>
      </Tooltip>
      <PasswordGenerator handle={handle} onUse={onUse} />
    </>
  );
}
