import type { PasswordKeySchema } from "./key-schema";

export type VaultUnlockInfo = {
  email: string;
  password: string;
  userPasswordKeys: PasswordKeySchema;
};
