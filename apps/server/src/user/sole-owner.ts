/** The user is the only active owner of a shared vault that has other members. */
export const SOLE_OWNER = "sole_owner";

/** The `cause` of a `SOLE_OWNER` refusal: the vaults to hand over or delete first. */
export class SoleOwnerCause extends Error {
  readonly vaultIds: string[];

  constructor(vaultIds: string[]) {
    super(SOLE_OWNER);
    this.vaultIds = vaultIds;
  }
}
