import { SecondFactorPromptProvider, useSecondFactorRequest } from "@repo/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/Dialog";
import type { ReactNode } from "react";
import SecondFactorForm from "./SecondFactorForm";

/**
 * Asks for the two-factor code of logins outside the login form: reconnecting
 * after an offline unlock, the fresh login of a password change, account
 * deletion or a two-factor change. A dialog over whatever is open.
 */
export function SecondFactorPromptRoot({ children }: { children: ReactNode }) {
  const { request, prompt, submit, cancel } = useSecondFactorRequest();

  return (
    <SecondFactorPromptProvider prompt={prompt}>
      {children}
      <Dialog
        open={request !== null}
        onOpenChange={(open) => {
          if (!open) cancel();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Two-factor authentication</DialogTitle>
            <DialogDescription>
              Your account asks for a code to sign in to the server. Enter the code from your
              authenticator app.
            </DialogDescription>
          </DialogHeader>
          {request && <SecondFactorForm request={request} onSubmit={submit} onCancel={cancel} />}
        </DialogContent>
      </Dialog>
    </SecondFactorPromptProvider>
  );
}
