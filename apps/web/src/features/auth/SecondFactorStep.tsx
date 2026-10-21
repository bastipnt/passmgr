import type { SecondFactorRequest } from "@repo/client";
import SecondFactorForm from "./SecondFactorForm";

export type SecondFactor = {
  request: SecondFactorRequest | null;
  submit: (code: string) => void;
  cancel: () => void;
};

/** The code step of a sign-in, in place of the password form. */
export default function SecondFactorStep({
  request,
  submit,
  cancel,
}: SecondFactor & { request: SecondFactorRequest }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="font-semibold text-base">Two-factor authentication</p>
        <p className="text-muted-foreground text-sm">Enter the code from your authenticator app.</p>
      </div>
      <SecondFactorForm request={request} onSubmit={submit} onCancel={cancel} />
    </div>
  );
}
