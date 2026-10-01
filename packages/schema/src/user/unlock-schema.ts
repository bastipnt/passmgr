import type { MemberVaultKey, PasswordKeySchema } from "./key-schema";

export type VaultUnlockInfo = {
  email: string;
  password: string;
  userPasswordKeys: PasswordKeySchema;
  vaultKeys: MemberVaultKey[];
};
