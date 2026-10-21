import { FieldError } from "@repo/ui/components/Field";
import type { ReactNode } from "react";
import { authPaths } from "@/app/route-paths";
import AuthTextLink from "./AuthTextLink";

/** A new vault that wasn't created, or was created but didn't open (`useCreateLocalVault`). */
export default function CreateErrorBox({
  error,
  afterUnlock,
}: {
  error: "failed" | "unlock_failed";
  /** What to do once unlocked, after the unlock link. */
  afterUnlock?: ReactNode;
}) {
  return (
    <FieldError variant="box">
      {error === "unlock_failed" ? (
        <span>
          Your vault was created, but it couldn&apos;t be opened.{" "}
          <AuthTextLink href={authPaths.login}>Unlock it with your password</AuthTextLink>
          {afterUnlock}
        </span>
      ) : (
        "Creating the vault failed. Please try again."
      )}
    </FieldError>
  );
}
