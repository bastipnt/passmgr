import { useVaults } from "@repo/client";
import { BoxedSelect } from "@repo/ui/components/form/ControlledBoxedSelect";
import { VaultTile } from "./VaultTile";

type VaultPickerProps = {
  value: string;
  onChange: (vaultId: string) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
};

/** Which of the vaults the user may write to a new item goes into. */
export function VaultPicker({
  value,
  onChange,
  disabled,
  label = "Vault",
  className,
}: VaultPickerProps) {
  const { writableVaults } = useVaults();
  const options = writableVaults.map((vault) => ({ value: vault.vaultId, label: vault.name }));

  return (
    <BoxedSelect
      label={label}
      options={options}
      value={value}
      onValueChange={(next) => next && onChange(next)}
      disabled={disabled}
      className={className}
      renderOption={(option) => {
        const vault = writableVaults.find((own) => own.vaultId === option.value);
        return (
          <>
            {vault && <VaultTile vault={vault} size="xs" />}
            {option.label}
          </>
        );
      }}
    />
  );
}
