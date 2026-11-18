import { ScrollArea } from "@repo/ui/components/ScrollArea";
import { useFlatGround } from "@repo/ui/hooks/use-flat-ground";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import type { ReactNode } from "react";
import { useLocation, useRoute } from "wouter";
import { overlayReturnPath } from "@/app/overlay-return";
import { usePageBack } from "@/app/page-transitions";
import { settingsPaths } from "@/app/route-paths";
import { AppShell } from "@/components/AppShell";
import { OverlayHeader } from "@/components/OverlayHeader";
import { BackToButton, CloseButton } from "@/components/PageBarButtons";
import { VerifyEmailPrompt } from "@/components/VerifyEmailDialog";
import { SettingsNav } from "./SettingsNav";
import { SettingsSearchField } from "./SettingsSearchField";
import { useSectionDetails } from "./settings-sections";

type SettingsLayoutProps = {
  children: ReactNode;
};

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

  return (
    <div className="flex h-dvh flex-col">
      <OverlayHeader
        title="Settings"
        titleClassName="w-60"
        closeLabel="Close settings"
        onClose={() => navigate(overlayReturnPath())}
      >
        <SettingsSearchField className="max-w-120 flex-1" />
      </OverlayHeader>
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
