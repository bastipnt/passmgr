import { useStore } from "@repo/client";
import { buttonVariants } from "@repo/ui/components/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/Card";
import { cn } from "@repo/ui/lib/utils";
import {
  ArrowRightIcon,
  ChevronRightIcon,
  LogInIcon,
  type LucideIcon,
  ShieldPlusIcon,
} from "lucide-react";
import { Link, Redirect, useSearchParams } from "wouter";
import { authPaths } from "@/app/route-paths";
import { PageMeta } from "@/components/PageMeta";
import { AuthHero, HeroChips } from "./AuthHero";
import AuthTextLink from "./AuthTextLink";
import PasswordNote from "./PasswordNote";

const CHIPS = ["Works offline", "Zero-knowledge", "End-to-end encrypted"];
const PHONE_CHIPS = ["Works offline", "Zero-knowledge", "E2E encrypted"];

type ChoiceProps = {
  href: string;
  icon: LucideIcon;
  title: string;
  primary?: boolean;
};

function Choice({ href, icon: Icon, title, primary = false }: ChoiceProps) {
  const Chevron = primary ? ArrowRightIcon : ChevronRightIcon;
  return (
    <Link
      href={href}
      className={cn(
        buttonVariants({ variant: primary ? "default" : "outline" }),
        "h-auto min-h-15 w-full justify-start gap-3 rounded-2xl p-3 text-left font-semibold text-[0.95rem] sm:min-h-19 sm:p-4 sm:text-base",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-[10px] sm:size-11 sm:rounded-xl",
          primary ? "bg-white/16 ring-1 ring-white/22" : "bg-primary/10 text-primary",
        )}
      >
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1 whitespace-normal">{title}</span>
      <Chevron className={cn("size-4.5", !primary && "text-muted-foreground")} aria-hidden />
    </Link>
  );
}

/**
 * First visit (ADR 0001 D2): no vault on this device yet, so create one or
 * log in to an account. A device that already holds a vault goes to its unlock.
 */
export default function WelcomePage() {
  const { loaded, profiles } = useStore();
  const [searchParams] = useSearchParams();
  const invite = searchParams.get("invite");

  if (!loaded) return null;
  if (profiles.length > 0) return <Redirect to={authPaths.login} replace />;

  const createHref =
    invite === null ? authPaths.create : `${authPaths.create}?${new URLSearchParams({ invite })}`;

  return (
    <>
      <PageMeta
        title="Welcome"
        description="Start a passmgr vault on this device, or log in to your account. Zero-knowledge, end-to-end encrypted."
        canonicalPath={authPaths.welcome}
      />
      <AuthHero
        title={
          <>
            <span className="block">One password</span>
            <span className="block">unlocks</span>
            <span className="block">all the rest.</span>
          </>
        }
        lead="passmgr encrypts your vault on this device before anything leaves it. Start without an account and turn on sync whenever you want."
      >
        <div className="max-sm:hidden">
          <HeroChips items={CHIPS} />
        </div>
      </AuthHero>

      <Card variant="glass" flatOnPhone>
        <CardHeader>
          <CardTitle className="max-sm:sr-only">Welcome to passmgr</CardTitle>
          <CardDescription>New here, or bringing an existing account?</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <nav aria-label="Get started" className="flex flex-col gap-4.5 sm:gap-5">
            <Choice href={createHref} icon={ShieldPlusIcon} title="Create a new vault" primary />
            <Choice
              href={authPaths.accountLogin}
              icon={LogInIcon}
              title="Log in to an existing account"
            />
          </nav>
          <p className="text-center text-muted-foreground text-sm">
            Have a backup file? <AuthTextLink href={authPaths.restore}>Restore it</AuthTextLink>
          </p>
          <PasswordNote className="max-sm:hidden" />
        </CardContent>
      </Card>

      <div className="mt-auto flex flex-col items-center gap-3 sm:hidden">
        <HeroChips items={PHONE_CHIPS} compact />
        <PasswordNote className="order-last" />
      </div>
    </>
  );
}
