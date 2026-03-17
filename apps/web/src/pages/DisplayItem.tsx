import { SessionContext, useGetItem, useShortcut, useDeleteItem } from "@repo/client";
import { Separator } from "@repo/ui/components/Separator";
import { CircleProgress } from "@repo/ui/components/CircleProgress";
import { ItemDisplayGroup, ItemDisplay } from "@repo/ui/complex-components/ItemDisplay";
import {
  EarthIcon,
  EditIcon,
  EllipsisVerticalIcon,
  KeyIcon,
  LockIcon,
  MailIcon,
  NotebookPenIcon,
  TextIcon,
  TrashIcon,
} from "lucide-react";
import { Fragment, useContext, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useTotp } from "@/hooks/totp-hook";
import Link from "@repo/ui/components/Link";
import { isDefined } from "@repo/util";
import { editSlug } from "@/data/routes";
import { toast } from "@repo/ui";
import { Skeleton } from "@repo/ui/components/Skeleton";
import {
  Item,
  ItemContent,
  ItemMedia,
  ItemTitle,
  ItemDescription,
  ItemGroup,
} from "@repo/ui/components/Item";
import { Button } from "@repo/ui/components/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/DropdownMenu";
import RemoveDialog from "@repo/ui/complex-components/RemoveDialog";

function Fallback() {
  return (
    <div className="grid grid-cols-1 p-8 items-start gap-4">
      <div className="grid grid-cols-[1fr_auto] items-center">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-8 w-16" />
      </div>

      <ItemGroup className="border rounded-lg gap-0">
        {[1, 2].map((i) => (
          <Item key={i} className="last:rounded-b-lg first:rounded-t-lg rounded-none">
            <ItemMedia variant="icon">
              <Skeleton className="size-4" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>
                <Skeleton className="h-3.5 w-20" />
              </ItemTitle>
              <ItemDescription>
                <Skeleton className="h-3.5 w-36" />
              </ItemDescription>
            </ItemContent>
          </Item>
        ))}
      </ItemGroup>
    </div>
  );
}

type DisplayItemProps = {
  entryId: string;
};

// TODO: rename entryId
function DisplayItemInner({ entryId }: DisplayItemProps) {
  const { isOffline } = useContext(SessionContext);
  const { item: data, ready } = useGetItem(entryId);
  const [_, navigate] = useLocation();
  const { progress, seconds, token } = useTotp(data?.totp);

  const { deleteItem } = useDeleteItem({
    onSuccess: () => {
      toast.success("Item deleted");
      navigate("/");
    },
  });

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const editLink = `/${editSlug}/${entryId}`;

  function copyField(value: string | undefined, label: string) {
    if (!value) return;
    void navigator.clipboard.writeText(value);
    toast.success(`${label} copied to clipboard`);
  }

  useShortcut("$mod+Shift+c", () => copyField(data?.password, "Password"), {
    description: "Copy password",
    enabled: ready && !!data?.password,
    allowInInput: true,
  });

  useShortcut("$mod+Shift+u", () => copyField(data?.username, "Username"), {
    description: "Copy username",
    enabled: ready && !!data?.username,
    allowInInput: true,
  });

  useShortcut("$mod+e", () => navigate(editLink), {
    description: "Copy username",
    enabled: ready && !!data?.username && !isOffline,
    allowInInput: true,
  });

  if (!ready || !data) return <Fallback />;

  return (
    <div className="grid grid-cols-1 p-8 items-start gap-4">
      <div className="grid grid-cols-[1fr_auto] items-center">
        <h1>{data.title}</h1>
        {!isOffline && (
          <div className="flex gap-2 items-center">
            <Link variant="ghost" href={editLink}>
              <EditIcon /> Edit
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <EllipsisVerticalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
                  <TrashIcon /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <RemoveDialog
              title="Delete item"
              description="Are you sure you want to delete this item? This action cannot be undone."
              removeTitle="Delete"
              onRemove={() => deleteItem(entryId)}
              open={deleteDialogOpen}
              onOpenChange={setDeleteDialogOpen}
            />
          </div>
        )}
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

        {isDefined(data.totp) && token && (
          <>
            <Separator />

            <ItemDisplay
              title="2FA token (TOTP)"
              value={token}
              onClick={() => copyField(token, "2FA token")}
              icon={<LockIcon />}
              actions={<CircleProgress progress={progress ?? 0}>{seconds}</CircleProgress>}
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
            value={<span className="whitespace-pre-line wrap-break-word">{data.note}</span>}
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

  return <DisplayItemInner entryId={entryId} />;
}
