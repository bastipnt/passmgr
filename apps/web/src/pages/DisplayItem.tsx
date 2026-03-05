import { useTRPC } from "@repo/client";
import { Separator } from "@repo/ui/components/Separator";
import { CircleProgress } from "@repo/ui/components/CircleProgress";
import { ItemDisplayGroup, ItemDisplay } from "@repo/ui/complex-components/ItemDisplay";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  EarthIcon,
  EditIcon,
  KeyIcon,
  LockIcon,
  MailIcon,
  NotebookPenIcon,
  TextIcon,
} from "lucide-react";
import { Fragment, Suspense } from "react";
import { useParams } from "wouter";
import { useTotp } from "@/hooks/totp-hook";
import Link from "@repo/ui/components/Link";
import { isDefined } from "@repo/util";
import { editSlug } from "@/data/routes";
import { decryptPayload } from "@/utils/vault";
import { toast } from "@repo/ui";

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
  const { data } = useSuspenseQuery({
    ...trpc.entry.getById.queryOptions(entryId),
    select: (item) => ({
      itemId: item.itemId,
      ...decryptPayload(item.encryptedData, item.encryptionNonce),
    }),
  });
  const { progress, seconds, token } = useTotp(data.totp);

  function copyField(value: string | undefined, label: string) {
    if (!value) return;
    void navigator.clipboard.writeText(value);
    toast.success(`${label} copied to clipboard`);
  }

  return (
    <div className="grid grid-cols-1 p-8 items-start gap-4">
      <div className="grid grid-cols-[1fr_auto]">
        <h1>{data.title}</h1>
        <Link href={`/${editSlug}/${entryId}`}>
          <EditIcon /> Edit
        </Link>
      </div>

      <ItemDisplayGroup>
        <ItemDisplay
          title="Username"
          value={data.username}
          onClick={() => copyField(data.username, "Username")}
          icon={<MailIcon />}
        />

        <Separator />

        <ItemDisplay
          title="Password"
          value={data.password}
          onClick={({ type }) => type === "copy" && copyField(data.password, "Password")}
          icon={<KeyIcon />}
          variant={data.password ? "password" : "noAction"}
        />

        {isDefined(data.totp) && (
          <>
            <Separator />

            <ItemDisplay
              title="2FA token (TOTP)"
              value={token}
              onClick={() => copyField(token, "2FA token")}
              icon={<LockIcon />}
              actions={
                <CircleProgress progress={(100 / (30 * 1_000)) * Number(progress)}>
                  {seconds}
                </CircleProgress>
              }
            />
          </>
        )}
      </ItemDisplayGroup>

      {isDefined(data.websites) && data.websites.length > 0 && (
        <ItemDisplayGroup>
          <ItemDisplay
            title="Websites"
            value={
              <ul>
                {data.websites.map(({ value }, i) => (
                  <li key={i}>
                    <Link target="_blank" href={value} className="p-0">
                      {value}
                    </Link>
                  </li>
                ))}
              </ul>
            }
            onClick={() => {}}
            icon={<EarthIcon />}
            variant="noAction"
          />
        </ItemDisplayGroup>
      )}

      {isDefined(data.note) && data.note !== "" && (
        <ItemDisplayGroup>
          <ItemDisplay
            title="Notes"
            value={data.note}
            onClick={() => {}}
            icon={<NotebookPenIcon />}
            variant="noAction"
          />
        </ItemDisplayGroup>
      )}

      {isDefined(data.extraFields) && data.extraFields.length > 0 && (
        <ItemDisplayGroup>
          {data.extraFields.map((extraField, i) => (
            <Fragment key={i}>
              <ItemDisplay
                title={extraField.title}
                value={extraField.value}
                onClick={({ type }) =>
                  type === "copy" && copyField(extraField.value, extraField.title)
                }
                icon={extraField.type === "secret" ? <LockIcon /> : <TextIcon />}
                variant={extraField.type === "secret" ? "hidden" : "default"}
              />
              {i < data.extraFields!.length - 1 && <Separator />}
            </Fragment>
          ))}
        </ItemDisplayGroup>
      )}
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
