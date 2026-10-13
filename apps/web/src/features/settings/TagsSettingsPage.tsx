import {
  InvalidTagError,
  itemCount,
  type TagCount,
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
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@repo/ui/components/Item";
import { PencilIcon, TagIcon, TrashIcon } from "lucide-react";
import { type SubmitEvent, useId, useState } from "react";
import { PanelHeader, PanelTitle } from "@/components/AppShell";

type Editing = { kind: "rename" | "delete"; tag: TagCount };

/** Every tag in use: rename one (onto another merges them) or remove it from every item. */
export default function TagsSettingsPage() {
  const tags = useTags();
  const actions = useTagActions();
  // Kept while a dialog closes, so its text doesn't change mid-animation.
  const [editing, setEditing] = useState<Editing>();
  const [open, setOpen] = useState(false);

  function edit(kind: Editing["kind"], tag: TagCount) {
    setEditing({ kind, tag });
    setOpen(true);
  }

  async function onDelete(tag: string) {
    setOpen(false);
    try {
      toast.success(tagEditSummary(`Removed “${tag}”`, await actions.deleteTag(tag)));
    } catch {
      toast.error(`“${tag}” couldn't be removed. Try again.`);
    }
  }

  return (
    <>
      <PanelHeader>
        <PanelTitle>Tags</PanelTitle>
      </PanelHeader>
      <div className="flex flex-col gap-3 px-4 pb-4">
        {tags.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No tags yet. Add tags to an item when you edit it, then filter the list by them.
          </p>
        ) : (
          <ItemGroup>
            {tags.map((tag) => (
              <Item key={tag.tag} variant="outline">
                <TagIcon className="size-4 text-muted-foreground" aria-hidden />
                <ItemContent className="min-w-0 gap-0.5">
                  <ItemTitle className="truncate">{tag.tag}</ItemTitle>
                  <ItemDescription>{itemCount(tag.count)}</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={actions.pending}
                    aria-label={`Rename ${tag.tag}`}
                    title="Rename"
                    onClick={() => edit("rename", tag)}
                  >
                    <PencilIcon />
                  </Button>
                  <Button
                    variant="ghost-destructive"
                    size="icon"
                    disabled={actions.pending}
                    aria-label={`Remove ${tag.tag}`}
                    title="Remove from every item"
                    onClick={() => edit("delete", tag)}
                  >
                    <TrashIcon />
                  </Button>
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        )}
      </div>

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
    </>
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
