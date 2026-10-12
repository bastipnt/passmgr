export type PasswordStrengthLevel = "weak" | "fair" | "strong" | "very-strong";

export const PASSWORD_STRENGTH_LABEL: Record<PasswordStrengthLevel, string> = {
  weak: "Weak",
  fair: "Fair",
  strong: "Strong",
  "very-strong": "Very strong",
};

export type PasswordStrength = {
  level: PasswordStrengthLevel;
  label: string;
  /** Why a user-entered password is guessable, e.g. "This is a commonly used password." */
  warning?: string;
};
