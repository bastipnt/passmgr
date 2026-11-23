import { usePasswordStrength } from "@repo/client";
import { ControlledPasswordInput, StrengthMeter } from "@repo/ui-native";
import { formSlice } from "@repo/ui-shared";
import { useRouter } from "expo-router";
import { KeyIcon, WandSparkles } from "lucide-react-native";
import { type Control, type UseFormSetValue, useWatch } from "react-hook-form";
import { Pressable } from "react-native";
import { useCSSVariable } from "uniwind";
import { usePasswordGenerator } from "@/features/password-generation/PasswordGeneratorContext";
import { useGeneratorPath } from "./generator-path";

/** Any form with a `password` field: a login, a Wi-Fi network. */
type PasswordFormValues = { password?: string };

type PasswordFieldProps<T extends PasswordFormValues> = {
  control: Control<T>;
  setValue: UseFormSetValue<T>;
};

const passwordSlice = formSlice<PasswordFormValues>();

export default function PasswordField<T extends PasswordFormValues>(props: PasswordFieldProps<T>) {
  const { control, setValue } = passwordSlice(props);
  const generatorPath = useGeneratorPath();
  const router = useRouter();
  const { registerTarget } = usePasswordGenerator();

  const iconColor = useCSSVariable("--color-muted-foreground") as string;
  const password = useWatch({ control, name: "password" }) ?? "";
  const strength = usePasswordStrength(password);

  const openGenerator = () => {
    registerTarget((generated) =>
      setValue("password", generated, { shouldDirty: true, shouldValidate: true }),
    );
    router.navigate(generatorPath);
  };

  return (
    <ControlledPasswordInput
      control={control}
      name="password"
      label="Password"
      autoComplete="off"
      icon={<KeyIcon size={18} color={iconColor} />}
      note={
        strength && (
          <StrengthMeter
            level={strength.level}
            label={`Strength: ${strength.label}`}
            detail={`${password.length} characters`}
            hint={strength.warning}
          />
        )
      }
      actions={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Generate password"
          hitSlop={8}
          className="p-0.5"
          style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}
          onPress={openGenerator}
        >
          <WandSparkles size={20} color={iconColor} />
        </Pressable>
      }
    />
  );
}
