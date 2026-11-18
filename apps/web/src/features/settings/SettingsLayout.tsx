import { useShortcut } from "@repo/client";
import { ScrollArea } from "@repo/ui/components/ScrollArea";
import { useFlatGround } from "@repo/ui/hooks/use-flat-ground";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { type ReactNode, useRef } from "react";
import { useLocation, useRoute } from "wouter";
import { overlayReturnPath } from "@/app/overlay-return";
import { usePageBack } from "@/app/page-transitions";
import { settingsPaths } from "@/app/route-paths";
import { AppShell } from "@/components/AppShell";
import { OverlayHeader } from "@/components/OverlayHeader";
import { BackToButton, CloseButton } from "@/components/PageBarButtons";
import { VerifyEmailPrompt } from "@/components/VerifyEmailDialog";
import { SHORTCUTS } from "@/lib/shortcuts";
import { SettingsNav } from "./SettingsNav";
import {
  SettingsSearchBox,
  SettingsSearchProvider,
  SettingsSearchResults,
  useSettingsSearchActive,
} from "./SettingsSearch";
import { useSectionDetails } from "./settings-sections";

type SettingsLayoutProps = {
  children: ReactNode;
};

/** Desktop: a full-screen overlay over the vault. Phone: a stack of pages under `/settings`. */
export default function SettingsLayout({ children }: SettingsLayoutProps) {
  const phone = useIsMobile();
  return (
    <SettingsSearchProvider key={String(phone)} phone={phone}>
      {phone ? (
        <PhoneSettings>{children}</PhoneSettings>
      ) : (
        <DesktopSettings>{children}</DesktopSettings>
      )}
    </SettingsSearchProvider>
  );
}

function DesktopSettings({ children }: SettingsLayoutProps) {
  useFlatGround();
  const [, navigate] = useLocation();
  const details = useSectionDetails();
  const searching = useSettingsSearchActive();
  const searchRef = useRef<HTMLInputElement>(null);
  const close = () => navigate(overlayReturnPath());
  const focusSearch = () => searchRef.current?.focus();
  useShortcut(SHORTCUTS.searchSettings.key, focusSearch, {
    description: SHORTCUTS.searchSettings.description,
  });
  // tinykeys matches modifiers exactly, and many layouts type "/" with Shift.
  useShortcut(`Shift+${SHORTCUTS.searchSettings.key}`, focusSearch);

  return (
    <div className="flex h-dvh flex-col">
      <OverlayHeader
        title="Settings"
        titleClassName="w-60"
        closeLabel="Close settings"
        onClose={close}
      >
        <SettingsSearchBox className="max-w-120 flex-1" inputRef={searchRef} onEscape={close} />
      </OverlayHeader>
      <div className="flex min-h-0 flex-1">
        <SettingsNav details={details} />
        <ScrollArea render={<main />} className="min-h-0 min-w-0 flex-1">
          {searching ? <SettingsSearchResults className="max-w-218 px-14 py-10" /> : children}
        </ScrollArea>
      </div>
      <VerifyEmailPrompt />
    </div>
  );
}

function PhoneSettings({ children }: SettingsLayoutProps) {
  const [isIndex] = useRoute(settingsPaths.index);
  const backToList = usePageBack(settingsPaths.index);
  const close = usePageBack(overlayReturnPath());

  return (
    <AppShell
      header={
        isIndex ? (
          <CloseButton label="Close settings" onClick={close} />
        ) : (
          <BackToButton label="Settings" onClick={backToList} />
        )
      }
    >
      <section>{children}</section>
      <VerifyEmailPrompt />
    </AppShell>
  );
}
