import type { SignInErrorMessage } from "@repo/client";
import { FieldError, FieldWarning } from "@repo/ui/components/Field";

export default function SignInError({ error }: { error?: SignInErrorMessage }) {
  if (!error) return null;
  const body = (
    <>
      <strong className="font-semibold">{error.title}</strong> {error.detail}
    </>
  );
  return error.warning ? (
    <FieldWarning>{body}</FieldWarning>
  ) : (
    <FieldError variant="box">{body}</FieldError>
  );
}
