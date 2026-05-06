export type PasswordStrengthLevel = "weak" | "fair" | "strong" | "very-strong";

export type PasswordStrength = {
  level: PasswordStrengthLevel;
  label: string;
  bits: number;
};
