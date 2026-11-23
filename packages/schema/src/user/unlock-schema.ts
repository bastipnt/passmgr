import type { MemberVault } from "../vault-schema";
import type { PasswordKeySchema, RecoveryWrapSchema, UserKeyPair } from "./key-schema";

export type VaultUnlockInfo = {
  email: string;
  userId: string;
  password: string;
  userPasswordKeys: PasswordKeySchema;
  recoveryKeys: RecoveryWrapSchema;
  vaultKeys: MemberVault[];
  userKeyPair: UserKeyPair;
};
