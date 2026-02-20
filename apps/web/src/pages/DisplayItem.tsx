import { useTRPC } from "@repo/client";
import { Separator } from "@repo/ui/components/Separator";
import { CircleProgress } from "@repo/ui/components/CircleProgress";
import { ItemDisplayGroup, ItemDisplay } from "@repo/ui/complex-components/ItemDisplay";
import { useSuspenseQuery } from "@tanstack/react-query";
import { KeyIcon, LockIcon, MailIcon } from "lucide-react";
import { Suspense } from "react";
import { useParams } from "wouter";
import { useTotp } from "@/hooks/totp-hook";

function Fallback() {
  return (
    <div>
      <h1>Loading...</h1>
    </div>
  );
}

type DisplayItemProps = {
  entryId: string;
};

function DisplayItemInner({ entryId }: DisplayItemProps) {
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(trpc.entry.getById.queryOptions(entryId));
  const { progress, seconds, token } = useTotp(data.totp);

  return (
    <div className="grid grid-cols-[auto_500px_auto] p-8 items-start">
      <ItemDisplayGroup>
        <ItemDisplay
          title="Username"
          value={data.username}
          onClick={() => {}}
          icon={<MailIcon />}
        />

        <Separator />

        <ItemDisplay
          title="Password"
          value={data.password}
          onClick={() => {}}
          icon={<KeyIcon />}
          variant="password"
        />

        <Separator />

        <ItemDisplay
          title="2FA token (TOTP)"
          value={token}
          onClick={() => {}}
          icon={<LockIcon />}
          actions={
            <CircleProgress progress={(100 / (30 * 1_000)) * Number(progress)}>
              {seconds}
            </CircleProgress>
          }
        />
      </ItemDisplayGroup>
    </div>
  );
}

export default function DisplayItem() {
  const { entryId } = useParams();
  if (!entryId) return <Fallback />;

  return (
    <Suspense fallback={<Fallback />}>
      <DisplayItemInner entryId={entryId} />
    </Suspense>
  );
}
