import { useTRPC } from "@repo/client";
import { Separator } from "@repo/ui/components/Separator";
import { CircleProgress } from "@repo/ui/components/CircleProgress";
import { ItemDisplayGroup, ItemDisplay } from "@repo/ui/complex-components/ItemDisplay";
import { useAnimationFrame } from "@repo/ui/hooks/animationFrameHook";
import { useSuspenseQuery } from "@tanstack/react-query";
import { KeyIcon, LockIcon, MailIcon } from "lucide-react";
import { Suspense, useState } from "react";
import { useParams } from "wouter";
import { getToken } from "@repo/crypto";

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
  const [token, setToken] = useState<string>();
  const [time, setTime] = useState(30);
  const [progress, setProgress] = useState(0);

  const tokenSecret = "HXJVNAVLL3MEVIQ5LJBPOU6VD245QV5Z";

  const updateToken = async () => {
    const newToken = await getToken(tokenSecret);
    setToken(newToken);
  };

  useAnimationFrame(({ deltaMs, type }) => {
    if (type === "100ms") setProgress(deltaMs);
    if (type === "1s") setTime(Math.floor(30 - deltaMs / 1_000));
    if (type === "30s") void updateToken();
  });

  return (
    <section className="grid grid-cols-[auto_500px_auto] p-8 items-start">
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
            <CircleProgress progress={(100 / (30 * 1000)) * Number(progress)}>
              {time}
            </CircleProgress>
          }
        />
      </ItemDisplayGroup>
    </section>
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
