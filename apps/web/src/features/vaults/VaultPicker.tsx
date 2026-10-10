import { useVaults } from "@repo/client";
import { Field, FieldLabel } from "@repo/ui/components/Field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/Select";
import { VaultTile } from "./VaultTile";

type VaultPickerProps = {
  value: string;
  onChange: (vaultId: string) => void;
  disabled?: boolean;
  label?: string;
};

/** Which of the vaults the user may write to a new item goes into. */
export function VaultPicker({ value, onChange, disabled, label = "Vault" }: VaultPickerProps) {
  const { writableVaults } = useVaults();
  const items = writableVaults.map((vault) => ({ value: vault.vaultId, label: vault.name }));

  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select
        items={items}
        value={value}
        onValueChange={(next) => onChange(next as string)}
        disabled={disabled}
      >
        <SelectTrigger className="w-full" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {writableVaults.map((vault) => (
              <SelectItem key={vault.vaultId} value={vault.vaultId}>
                <VaultTile vault={vault} size="xs" />
                {vault.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}
