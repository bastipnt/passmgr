import { createContext, type ReactNode, useContext } from "react";
import { noSecondFactor, type SecondFactorPrompt } from "../login";

const SecondFactorPromptContext = createContext<SecondFactorPrompt>(noSecondFactor);

/**
 * How logins that don't come from a login form ask for a second-factor code:
 * the reconnect after an offline unlock, the fresh login of a password change
 * or account deletion. The app renders the prompt (web: a dialog; mobile: a
 * sheet), see `useSecondFactorRequest`. Without a provider such a login is
 * cancelled when the account has two-factor on.
 */
export function SecondFactorPromptProvider({
  prompt,
  children,
}: {
  prompt: SecondFactorPrompt;
  children: ReactNode;
}) {
  return <SecondFactorPromptContext value={prompt}>{children}</SecondFactorPromptContext>;
}

export function useSecondFactorPrompt(): SecondFactorPrompt {
  return useContext(SecondFactorPromptContext);
}
