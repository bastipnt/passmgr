import {
  useVaultActions,
  useVaultForm,
  VAULT_COLOR_LABELS,
  VAULT_COLORS,
  VAULT_ICON_LABELS,
  VAULT_ICONS,
  type VaultColor,
  type VaultInfo,
} from "@repo/client";
import { toast } from "@repo/ui";
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
import { Field, FieldError, FieldGroup, FieldLabel } from "@repo/ui/components/Field";
import { Input } from "@repo/ui/components/Input";
import { Spinner } from "@repo/ui/components/Spinner";
import { hueTint } from "@repo/ui/lib/hue-tint";
import { cn } from "@repo/ui/lib/utils";
import { type SubmitEvent, useId, useState } from "react";
import { VAULT_ICON_COMPONENTS, VaultTile } from "./VaultTile";

type VaultDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The vault to edit; without one the dialog creates a vault. */
  vault?: VaultInfo;
  /** After a create: the new vault's id. */
  onCreated?: (vaultId: string) => void;
};

/** Create a vault, or rename one and change its icon and colour (ADR 0001 D6). */
export function VaultDialog({ open, onOpenChange, vault, onCreated }: VaultDialogProps) {
  const actions = useVaultActions();
  const { pending } = actions;
  // A new form per opening, so a cancelled edit doesn't linger. Not unmounted on
  // close: the content stays while the dialog animates out.
  const [opening, setOpening] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setOpening((n) => n + 1);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <VaultForm
          key={opening}
          vault={vault}
          actions={actions}
          onDone={() => onOpenChange(false)}
          onCreated={onCreated}
        />
      </DialogContent>
    </Dialog>
  );
}

type VaultFormProps = {
  vault?: VaultInfo;
  actions: ReturnType<typeof useVaultActions>;
  onDone: () => void;
  onCreated?: (vaultId: string) => void;
};

function VaultForm({ vault, actions, onDone, onCreated }: VaultFormProps) {
  const { pending } = actions;
  const { name, setName, icon, setIcon, color, setColor, error, save } = useVaultForm({
    vault,
    actions,
    onSaved: (saved) => {
      if (saved.created) {
        toast.success(`Vault “${saved.name}” created`);
        onCreated?.(saved.vaultId);
      } else {
        toast.success("Vault saved");
      }
      onDone();
    },
  });
  const nameId = useId();

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    await save();
  }

  return (
    <form onSubmit={submit}>
      <DialogHeader className="flex-row items-center gap-3">
        <VaultTile vault={{ icon, color }} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <DialogTitle>{vault ? "Edit vault" : "New vault"}</DialogTitle>
          <DialogDescription>
            {vault
              ? "Name, icon and colour are encrypted with the vault."
              : "Keep items apart, e.g. Personal and Work."}
          </DialogDescription>
        </div>
      </DialogHeader>

      <FieldGroup className="my-4 gap-4">
        <Field>
          <FieldLabel htmlFor={nameId}>Name</FieldLabel>
          <Input
            id={nameId}
            value={name}
            maxLength={64}
            autoComplete="off"
            disabled={pending}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-medium text-sm">Icon</legend>
          <div className="flex flex-wrap gap-2">
            {VAULT_ICONS.map((option) => {
              const Icon = VAULT_ICON_COMPONENTS[option];
              const selected = option === icon;
              return (
                <label
                  key={option}
                  style={selected ? hueTint(VAULT_COLORS[color]) : undefined}
                  className={cn(
                    "grid size-10 cursor-pointer place-items-center rounded-xl border border-foreground/10 has-focus-visible:ring-4 has-focus-visible:ring-ring/25 dark:border-white/10",
                    selected ? "border-transparent" : "text-muted-foreground hover:bg-foreground/5",
                  )}
                >
                  <input
                    type="radio"
                    name="vault-icon"
                    value={option}
                    aria-label={VAULT_ICON_LABELS[option]}
                    checked={selected}
                    disabled={pending}
                    onChange={() => setIcon(option)}
                    className="sr-only"
                  />
                  <Icon className="size-5" aria-hidden />
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-medium text-sm">Colour</legend>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(VAULT_COLORS) as VaultColor[]).map((option) => (
              <label
                key={option}
                style={{ backgroundColor: `oklch(0.68 0.16 ${VAULT_COLORS[option]})` }}
                className={cn(
                  "size-8 cursor-pointer rounded-full ring-offset-2 ring-offset-background has-focus-visible:ring-4 has-focus-visible:ring-ring/25",
                  option === color && "ring-2 ring-foreground",
                )}
              >
                <input
                  type="radio"
                  name="vault-color"
                  value={option}
                  aria-label={VAULT_COLOR_LABELS[option]}
                  checked={option === color}
                  disabled={pending}
                  onChange={() => setColor(option)}
                  className="sr-only"
                />
              </label>
            ))}
          </div>
        </fieldset>

        {error && <FieldError variant="box">{error}</FieldError>}
      </FieldGroup>

      <DialogFooter>
        <DialogClose
          render={
            <Button variant="secondary" disabled={pending}>
              Cancel
            </Button>
          }
        />
        <Button type="submit" disabled={pending}>
          {vault ? "Save" : "Create vault"}
          {pending && <Spinner data-icon="inline-end" />}
        </Button>
      </DialogFooter>
    </form>
  );
}
