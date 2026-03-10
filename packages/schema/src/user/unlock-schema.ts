import type { PasswordKeySchema } from "./key-schema";

export type VaultUnlockInfo = {
  password: string;
  userPasswordKeys: PasswordKeySchema;
};
