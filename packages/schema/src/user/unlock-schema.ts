import type { MemberVaultKey, PasswordKeySchema, UserKeyPair } from "./key-schema";

export type VaultUnlockInfo = {
  email: string;
  password: string;
  userPasswordKeys: PasswordKeySchema;
  vaultKeys: MemberVaultKey[];
  userKeyPair: UserKeyPair;
};
