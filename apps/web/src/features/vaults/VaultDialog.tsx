import {
  DEFAULT_VAULT_COLOR,
  DEFAULT_VAULT_ICON,
  useVaultActions,
  VAULT_COLOR_LABELS,
  VAULT_COLORS,
  VAULT_ICON_LABELS,
  VAULT_ICONS,
  type VaultColor,
  type VaultIcon,
  type VaultInfo,
  vaultColor,
  vaultErrorMessage,
  vaultIcon,
} from "@repo/client";
import { vaultMetaSchema } from "@repo/schema";
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
import { cn } from "@repo/ui/lib/utils";
import { type SubmitEvent, useId, useState } from "react";
import { VAULT_ICON_COMPONENTS, VaultTile, vaultTint } from "./VaultTile";

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
  const { createVault, renameVault, pending } = actions;
  const [name, setName] = useState(vault?.name ?? "");
  const [icon, setIcon] = useState<VaultIcon>(vault ? vaultIcon(vault) : DEFAULT_VAULT_ICON);
  const [color, setColor] = useState<VaultColor>(vault ? vaultColor(vault) : DEFAULT_VAULT_COLOR);
  const [error, setError] = useState<string>();
  const nameId = useId();

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = vaultMetaSchema.safeParse({ name, icon, color });
    if (!parsed.success) {
      setError("Give the vault a name (up to 64 characters).");
      return;
    }
    setError(undefined);
    try {
      if (vault) {
        await renameVault(vault.vaultId, parsed.data);
        toast.success("Vault saved");
      } else {
        const vaultId = await createVault(parsed.data);
        toast.success(`Vault “${parsed.data.name}” created`);
        onCreated?.(vaultId);
      }
      onDone();
    } catch (e) {
      setError(vaultErrorMessage(e, "The vault couldn't be saved. Try again."));
    }
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
                  style={selected ? vaultTint(VAULT_COLORS[color]) : undefined}
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
