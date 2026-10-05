import type { MemberVault } from "../vault-schema";
import type { PasswordKeySchema, UserKeyPair } from "./key-schema";

export type VaultUnlockInfo = {
  email: string;
  userId: string;
  password: string;
  userPasswordKeys: PasswordKeySchema;
  vaultKeys: MemberVault[];
  userKeyPair: UserKeyPair;
};
