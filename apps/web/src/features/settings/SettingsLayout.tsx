import { Button } from "@repo/ui/components/Button";
import { ScrollArea } from "@repo/ui/components/ScrollArea";
import { useFlatGround } from "@repo/ui/hooks/use-flat-ground";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { ChevronLeftIcon, XIcon } from "lucide-react";
import { type ReactNode, useEffect, useEffectEvent } from "react";
import { useLocation, useRoute } from "wouter";
import { usePageBack } from "@/app/page-transitions";
import { settingsPaths } from "@/app/route-paths";
import { settingsReturnPath } from "@/app/settings-return";
import { AppShell } from "@/components/AppShell";
import { VerifyEmailPrompt } from "@/components/VerifyEmailDialog";
import { SettingsNav } from "./SettingsNav";
import { SettingsSearchField } from "./SettingsSearchField";
import { useSectionDetails } from "./settings-sections";

type SettingsLayoutProps = {
  children: ReactNode;
};

// Esc belongs to these while one has focus (they close themselves, or clear), not to the overlay.
const OWNS_ESCAPE =
  'dialog, [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], input, textarea, select';

/** Desktop: a full-screen overlay over the vault. Phone: a stack of pages under `/settings`. */
export default function SettingsLayout({ children }: SettingsLayoutProps) {
  return useIsMobile() ? (
    <PhoneSettings>{children}</PhoneSettings>
  ) : (
    <DesktopSettings>{children}</DesktopSettings>
  );
}

function DesktopSettings({ children }: SettingsLayoutProps) {
  useFlatGround();
  const [, navigate] = useLocation();
  const details = useSectionDetails();
  const close = () => navigate(settingsReturnPath());

  // A plain listener, not `useShortcut`: that one prevents the default, which would keep
  // a native dialog from closing on the same Esc.
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    if (event.target instanceof Element && event.target.closest(OWNS_ESCAPE)) return;
    close();
  });
  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-16 shrink-0 items-center gap-4 border-border border-b bg-card px-6">
        <h1 className="w-60 shrink-0 font-display font-semibold text-xl">Settings</h1>
        <SettingsSearchField className="max-w-120 flex-1" />
        <span aria-hidden="true" className="ml-auto text-muted-foreground text-xs">
          Esc
        </span>
        <Button variant="outline" size="icon-lg" aria-label="Close settings" onClick={close}>
          <XIcon />
        </Button>
      </header>
      <div className="flex min-h-0 flex-1">
        <SettingsNav details={details} />
        <ScrollArea render={<main />} className="min-h-0 min-w-0 flex-1">
          {children}
        </ScrollArea>
      </div>
      <VerifyEmailPrompt />
    </div>
  );
}

function PhoneSettings({ children }: SettingsLayoutProps) {
  const [isIndex] = useRoute(settingsPaths.index);
  const backToList = usePageBack(settingsPaths.index);
  const close = usePageBack(settingsReturnPath());

  return (
    <AppShell
      header={
        isIndex ? (
          <Button
            variant="floating"
            size="icon-xl"
            className="ml-auto"
            aria-label="Close settings"
            onClick={close}
          >
            <XIcon className="size-5" />
          </Button>
        ) : (
          // A pushed page (`PageTransitions`): step back rather than push the list.
          <Button
            variant="ghost"
            size="lg"
            className="-ml-3 gap-0.5 px-2 font-medium text-primary-text"
            aria-label="Back to Settings"
            onClick={backToList}
          >
            <ChevronLeftIcon className="size-5.5" />
            Settings
          </Button>
        )
      }
    >
      <section>{children}</section>
      <VerifyEmailPrompt />
    </AppShell>
  );
}
