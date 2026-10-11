import { VAULT_ROLE_DESCRIPTIONS, VAULT_ROLE_LABELS } from "@repo/client";
import type { VaultRole } from "@repo/schema";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/Select";
import { cn } from "@repo/ui/lib/utils";

type RoleSelectProps = {
  value: VaultRole;
  /** The roles on offer (`assignableRoles`). */
  roles: readonly VaultRole[];
  onValueChange: (role: VaultRole) => void;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
  className?: string;
  size?: "sm" | "default";
};

/** Pick a member's role in a vault, each with what it allows. */
export function RoleSelect({
  value,
  roles,
  onValueChange,
  disabled,
  id,
  className,
  size,
  ...props
}: RoleSelectProps) {
  const items = roles.map((role) => ({ value: role, label: VAULT_ROLE_LABELS[role] }));
  return (
    <Select
      items={items}
      value={value}
      disabled={disabled}
      onValueChange={(next) => onValueChange(next as VaultRole)}
    >
      <SelectTrigger
        id={id}
        size={size}
        aria-label={props["aria-label"]}
        className={cn("w-full", className)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {roles.map((role) => (
            <SelectItem key={role} value={role}>
              <span className="flex flex-col">
                <span>{VAULT_ROLE_LABELS[role]}</span>
                <span className="text-muted-foreground text-xs">
                  {VAULT_ROLE_DESCRIPTIONS[role]}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
