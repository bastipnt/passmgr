import { Platform } from "react-native";
import { useCSSVariable } from "uniwind";
import { Button, type ButtonProps } from "../Button";
import { BiometricGlyph } from "./BiometricGlyph";

const LABEL = Platform.OS === "ios" ? "Unlock with Face ID" : "Unlock with biometrics";

/** Primary unlock button for the OS biometric prompt; an SF Symbol keeps the native iOS button. */
export function BiometricUnlockButton(
  props: Omit<ButtonProps, "children" | "icon" | "systemImage">,
) {
  const color = useCSSVariable("--color-primary-foreground") as string;

  return (
    <Button
      size="lg"
      {...(Platform.OS === "ios"
        ? { systemImage: "faceid" }
        : { icon: <BiometricGlyph size={20} color={color} /> })}
      {...props}
    >
      {LABEL}
    </Button>
  );
}
