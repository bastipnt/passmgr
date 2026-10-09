import { useAppConfig, useStore } from "@repo/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/Card";
import {
  ChevronRightIcon,
  CloudIcon,
  HardDriveIcon,
  LogInIcon,
  type LucideIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { Link, Redirect, useSearchParams } from "wouter";
import { authPaths } from "@/app/route-paths";
import { PageMeta } from "@/components/PageMeta";
import { AuthHero, HeroAccent, HeroChips } from "./AuthHero";
import AuthTextLink from "./AuthTextLink";

type ChoiceProps = {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
};

function Choice({ href, icon: Icon, title, description }: ChoiceProps) {
  return (
    <Link
      href={href}
      className="flex w-full items-center gap-3 rounded-2xl border border-foreground/10 bg-white/40 p-3 text-left outline-none transition-colors hover:bg-white/70 focus-visible:ring-4 focus-visible:ring-ring/25 dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/10"
    >
      <span
        aria-hidden
        className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"
      >
        <Icon className="size-5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-semibold text-sm">{title}</span>
        <span className="text-muted-foreground text-xs">{description}</span>
      </span>
      <ChevronRightIcon className="size-4 text-muted-foreground" aria-hidden />
    </Link>
  );
}

/**
 * First visit (ADR 0001 D2): no vault on this device yet, so choose how to
 * start — a vault on this device only (an account can follow later), a new
 * account, or signing in. A device that already holds a vault goes to its
 * unlock instead.
 */
export default function WelcomePage() {
  const { loaded, profiles } = useStore();
  const { registrationEnabled } = useAppConfig();
  const [searchParams] = useSearchParams();
  // Like `AuthRoutes`: an invite opens registration even when it is closed.
  const invite = searchParams.get("invite");
  const canRegister = registrationEnabled || invite !== null;

  if (!loaded) return null;
  if (profiles.length > 0) return <Redirect to={authPaths.login} replace />;

  return (
    <>
      <PageMeta
        title="Welcome"
        description="Start a passmgr vault on this device, or sign in to your account. Zero-knowledge, end-to-end encrypted."
        canonicalPath={authPaths.welcome}
      />
      <AuthHero
        title={
          <>
            Your secrets, <HeroAccent>seen by no one</HeroAccent> but you.
          </>
        }
        lead="passmgr encrypts your vault on this device before anything leaves it. Start without an account and add one whenever you want to sync."
      >
        <HeroChips items={["Works offline", "Zero-knowledge", "End-to-end encrypted"]} />
      </AuthHero>

      <Card variant="glass">
        <CardHeader>
          <CardTitle>Get started</CardTitle>
          <CardDescription>How do you want to use passmgr?</CardDescription>
        </CardHeader>
        <CardContent>
          <nav aria-label="Get started" className="flex flex-col gap-2">
            <Choice
              href={authPaths.createLocal}
              icon={HardDriveIcon}
              title="Use on this device"
              description="No account, no server. Create one later to sync."
            />
            {canRegister && (
              <Choice
                href={
                  invite === null
                    ? authPaths.register
                    : `${authPaths.register}?${new URLSearchParams({ invite })}`
                }
                icon={CloudIcon}
                title="Create an account"
                description="Sync and back up your vault across devices."
              />
            )}
            <Choice
              href={authPaths.login}
              icon={LogInIcon}
              title="Sign in"
              description="You already have an account."
            />
          </nav>
        </CardContent>
        <CardContent className="flex flex-col items-center gap-3">
          <p className="text-muted-foreground text-xs">
            Have a backup file?{" "}
            <AuthTextLink href={authPaths.restore} tone="muted">
              Restore it
            </AuthTextLink>
          </p>
          <p className="flex items-center justify-center gap-1.5 text-muted-foreground text-xs">
            <ShieldCheckIcon className="size-3.5" aria-hidden />
            Your password never leaves this device
          </p>
        </CardContent>
      </Card>
    </>
  );
}
