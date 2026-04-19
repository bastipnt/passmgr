import {
  SessionContext,
  useGetItem,
  useShortcut,
  useDeleteItem,
  useUpdateItem,
  encryptItem,
} from "@repo/client";
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
import { Fragment, useContext, useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useTotp } from "@/hooks/totp-hook";
import Link from "@repo/ui/components/Link";
import { isDefined } from "@repo/util";
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
import LoginItemForm from "@/forms/LoginItemForm";
import { CURRENT_CRYPTO_VERSION, type LoginItem } from "@repo/schema";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@repo/ui/components/Sheet";
import { useEditingContext } from "@/providers/EditingProvider";

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
  const { isEditing, setIsEditing } = useEditingContext();
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false);

  function handleEditSheetChange(open: boolean) {
    setIsEditSheetOpen(open);
    setIsEditing(open);
  }

  const { deleteItem } = useDeleteItem({
    onSuccess: () => {
      toast.success("Item deleted");
      navigate("/");
    },
  });

  const { updateItem, updateItemError } = useUpdateItem({
    onSuccess: () => {
      handleEditSheetChange(false);
      toast.success("Item saved");
    },
  });

  useEffect(() => {
    if (isDefined(updateItemError)) toast.error("Error saving");
  }, [updateItemError]);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  function copyField(value: string | undefined, label: string) {
    if (!value) return;
    void navigator.clipboard.writeText(value);
    toast.success(`${label} copied to clipboard`);
  }

  useShortcut("$mod+Shift+c", () => copyField(data?.password, "Password"), {
    description: "Copy password",
    enabled: ready && !!data?.password && !isEditing,
    allowInInput: true,
  });

  useShortcut("$mod+Shift+u", () => copyField(data?.username, "Username"), {
    description: "Copy username",
    enabled: ready && !!data?.username && !isEditing,
    allowInInput: true,
  });

  useShortcut("$mod+e", () => handleEditSheetChange(true), {
    description: "Edit item",
    enabled: ready && !!data?.username && !isOffline && !isEditing,
    allowInInput: true,
  });

  if (!ready || !data) return <Fallback />;

  function handleSubmit(formValues: LoginItem) {
    const { encryptedData, encryptionNonce } = encryptItem({
      schemaVersion: data!.schemaVersion,
      ...formValues,
    });
    updateItem({
      itemId: entryId,
      encryptedData,
      encryptionNonce,
      cryptoVersion: CURRENT_CRYPTO_VERSION,
      version: data!.version,
      clientUpdatedAt: new Date().toISOString(),
    });
  }

  const defaultValues: Partial<LoginItem> = {
    title: data.title,
    username: data.username,
    password: data.password,
    totp: data.totp,
    websites: data.websites,
    note: data.note,
    extraFields: data.extraFields,
  };

  return (
    <div className="grid grid-cols-1 p-8 items-start gap-4">
      <div className="grid grid-cols-[1fr_auto] items-center">
        <h1>{data.title}</h1>
        {!isOffline && (
          <div className="flex gap-2 items-center">
            <Button variant="ghost" onClick={() => handleEditSheetChange(true)}>
              <EditIcon /> Edit
            </Button>
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

      <Sheet open={isEditSheetOpen} onOpenChange={handleEditSheetChange}>
        <SheetContent className="overflow-y-auto data-[side=right]:sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Edit Login</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-4">
            <LoginItemForm
              onSubmit={handleSubmit}
              onDelete={() => deleteItem(entryId)}
              onCancel={() => handleEditSheetChange(false)}
              serverError={updateItemError?.message}
              defaultValues={defaultValues}
              action="Save"
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default function DisplayItem() {
  const { entryId } = useParams();
  if (!entryId) return <Fallback />;

  return <DisplayItemInner entryId={entryId} />;
}
