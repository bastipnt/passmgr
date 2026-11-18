import {
  filterAndSortTags,
  InvalidTagError,
  itemCount,
  type TagCount,
  type TagSort,
  tagEditSummary,
  useTagActions,
  useTags,
} from "@repo/client";
import { MAX_TAG_LENGTH } from "@repo/schema";
import { toast } from "@repo/ui";
import RemoveDialog from "@repo/ui/complex-components/RemoveDialog";
import { Button } from "@repo/ui/components/Button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/Dialog";
import { Field, FieldError, FieldLabel } from "@repo/ui/components/Field";
import { Input } from "@repo/ui/components/Input";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { counted } from "@repo/util";
import { PencilIcon, TrashIcon } from "lucide-react";
import { type SubmitEvent, useDeferredValue, useId, useMemo, useState } from "react";
import { type SettingsAction, SettingsActionsSheet } from "./SettingsActionsSheet";
import { SettingsGroup } from "./SettingsGroup";
import { SettingsPage } from "./SettingsPage";
import { SettingsRow, SettingsRowButton, SettingsSegmented } from "./SettingsRow";
import { SettingsSearchField } from "./SettingsSearchField";

const SORTS = [
  { value: "used", label: "Most used" },
  { value: "name", label: "A–Z" },
] as const satisfies readonly { value: TagSort; label: string }[];

function TagLabel({ tag }: { tag: TagCount }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <span className="truncate rounded-full bg-muted px-2.5 py-0.5 font-medium text-[13px] text-primary-text">
        {tag.tag}
      </span>
      <span className="shrink-0 font-normal text-[13px] text-muted-foreground">
        {itemCount(tag.count)}
      </span>
    </span>
  );
}

type Editing = { kind: "rename" | "delete"; tag: TagCount };

/**
 * Every tag in use, filtered and sorted: rename one (onto another merges them)
 * or remove it from every item. The header stays while the list scrolls under it.
 */
export default function TagsSettingsPage() {
  const tags = useTags();
  const actions = useTagActions();
  const isMobile = useIsMobile();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<TagSort>("used");
  const deferredQuery = useDeferredValue(query);
  const shown = useMemo(
    () => filterAndSortTags(tags, deferredQuery, sort),
    [tags, deferredQuery, sort],
  );
  // Kept while a dialog or the sheet closes, so its text doesn't change mid-animation.
  const [editing, setEditing] = useState<Editing>();
  const [open, setOpen] = useState(false);
  const [sheetTag, setSheetTag] = useState<TagCount>();
  const [sheetOpen, setSheetOpen] = useState(false);

  function edit(kind: Editing["kind"], tag: TagCount) {
    setEditing({ kind, tag });
    setOpen(true);
  }

  /** Rename and remove: icon buttons on desktop, the phone's sheet. */
  const tagActions = (tag: TagCount): SettingsAction[] => [
    {
      key: "rename",
      label: "Rename",
      ariaLabel: `Rename ${tag.tag}`,
      icon: PencilIcon,
      run: () => edit("rename", tag),
    },
    {
      key: "delete",
      label: "Remove from every item",
      ariaLabel: `Remove ${tag.tag}`,
      icon: TrashIcon,
      destructive: true,
      run: () => edit("delete", tag),
    },
  ];

  async function onDelete(tag: string) {
    setOpen(false);
    try {
      toast.success(tagEditSummary(`Removed “${tag}”`, await actions.deleteTag(tag)));
    } catch {
      toast.error(`“${tag}” couldn't be removed. Try again.`);
    }
  }

  return (
    <SettingsPage
      title="Tags"
      description={
        isMobile
          ? "Rename or remove a tag on every item at once."
          : "Rename or remove a tag on every item at once. Add tags from an item."
      }
      stickyHeader={tags.length > 0}
      toolbar={
        tags.length > 0 && (
          <div className="flex items-center gap-3 max-sm:flex-col max-sm:items-stretch max-sm:gap-4">
            <SettingsSearchField
              label="Filter tags"
              placeholder={`Filter ${counted(tags.length, "tag", "tags")}`}
              value={query}
              onValueChange={setQuery}
              className="h-9 flex-1 bg-card"
            />
            <SettingsSegmented
              aria-label="Sort tags"
              options={SORTS}
              value={sort}
              onValueChange={setSort}
            />
          </div>
        )
      }
    >
      {tags.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No tags yet. Add tags to an item when you edit it, then filter the list by them.
        </p>
      ) : shown.length === 0 ? (
        <p className="text-muted-foreground text-sm">No tag matches “{deferredQuery.trim()}”.</p>
      ) : (
        <SettingsGroup label="All tags" list>
          {shown.map((tag) => (
            <li key={tag.tag}>
              {isMobile ? (
                <SettingsRowButton
                  label={<TagLabel tag={tag} />}
                  chevron
                  disabled={actions.pending}
                  onClick={() => {
                    setSheetTag(tag);
                    setSheetOpen(true);
                  }}
                />
              ) : (
                <SettingsRow
                  className="min-h-13 py-2 pr-3"
                  label={<TagLabel tag={tag} />}
                  control={tagActions(tag).map((action) => (
                    <Button
                      key={action.key}
                      variant={action.destructive ? "ghost-destructive" : "ghost"}
                      size="icon"
                      disabled={actions.pending}
                      aria-label={action.ariaLabel}
                      title={action.label}
                      onClick={action.run}
                    >
                      <action.icon />
                    </Button>
                  ))}
                />
              )}
            </li>
          ))}
        </SettingsGroup>
      )}

      {sheetTag && (
        <SettingsActionsSheet
          title={sheetTag.tag}
          summary={
            <span className="text-muted-foreground text-sm">{itemCount(sheetTag.count)}</span>
          }
          actions={[
            {
              key: "rename",
              label: "Rename",
              icon: PencilIcon,
              run: () => edit("rename", sheetTag),
            },
            {
              key: "delete",
              label: "Remove from every item",
              icon: TrashIcon,
              destructive: true,
              run: () => edit("delete", sheetTag),
            },
          ]}
          open={sheetOpen}
          onOpenChange={setSheetOpen}
        />
      )}
      {editing?.kind === "rename" && (
        <RenameTagDialog
          key={editing.tag.tag}
          tag={editing.tag}
          actions={actions}
          open={open}
          onOpenChange={setOpen}
        />
      )}
      {editing?.kind === "delete" && (
        <RemoveDialog
          open={open}
          onOpenChange={setOpen}
          title={`Remove “${editing.tag.tag}”?`}
          description={`It comes off ${itemCount(editing.tag.count)}, on every device. The items stay.`}
          removeTitle="Remove tag"
          onRemove={() => void onDelete(editing.tag.tag)}
        />
      )}
    </SettingsPage>
  );
}

type RenameTagDialogProps = {
  tag: TagCount;
  actions: ReturnType<typeof useTagActions>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function RenameTagDialog({ tag, actions, open, onOpenChange }: RenameTagDialogProps) {
  const [name, setName] = useState(tag.tag);
  const [error, setError] = useState<string>();
  const nameId = useId();

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    try {
      const result = await actions.renameTag(tag.tag, name);
      onOpenChange(false);
      toast.success(tagEditSummary(`Renamed “${tag.tag}”`, result));
    } catch (e) {
      setError(
        e instanceof InvalidTagError ? e.message : "The tag couldn't be renamed. Try again.",
      );
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (actions.pending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Rename tag</DialogTitle>
            <DialogDescription>
              Renamed on {itemCount(tag.count)}. A name already in use merges the two tags.
            </DialogDescription>
          </DialogHeader>
          <Field className="my-4" data-invalid={!!error}>
            <FieldLabel htmlFor={nameId}>Name</FieldLabel>
            <Input
              id={nameId}
              value={name}
              maxLength={MAX_TAG_LENGTH}
              autoComplete="off"
              disabled={actions.pending}
              aria-invalid={!!error}
              onChange={(e) => setName(e.target.value)}
            />
            {error && <FieldError>{error}</FieldError>}
          </Field>
          <DialogFooter>
            <DialogClose render={<Button variant="secondary">Cancel</Button>} />
            <Button type="submit" disabled={actions.pending}>
              Rename
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
