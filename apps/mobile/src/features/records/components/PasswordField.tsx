import { Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useWatch, type Control, type UseFormSetValue } from "react-hook-form";
import { DicesIcon, KeyIcon } from "lucide-react-native";
import { useCSSVariable } from "uniwind";
import { getStrengthFromString } from "@repo/crypto";
import { type LoginRecord as FormValues } from "@repo/schema";
import { ControlledPasswordInput, StrengthMeter } from "@repo/ui-native";
import { usePasswordGenerator } from "@/features/password-generation/PasswordGeneratorContext";

type PasswordFieldProps = {
  control: Control<FormValues>;
  setValue: UseFormSetValue<FormValues>;
};

export default function PasswordField({ control, setValue }: PasswordFieldProps) {
  const router = useRouter();
  const { recordId } = useLocalSearchParams<{ recordId: string }>();
  const { registerTarget } = usePasswordGenerator();

  const iconColor = useCSSVariable("--color-muted-foreground") as string;
  const password = useWatch({ control, name: "password" }) ?? "";
  const strength = password ? getStrengthFromString(password) : null;

  const openGenerator = () => {
    registerTarget((generated) =>
      setValue("password", generated, { shouldDirty: true, shouldValidate: true }),
    );
    router.navigate(`/${recordId}/generate-password`);
  };

  return (
    <ControlledPasswordInput
      control={control}
      name="password"
      label="Password"
      autoComplete="off"
      icon={<KeyIcon size={18} color={iconColor} />}
      note={strength && <StrengthMeter level={strength.level} label={strength.label} />}
      actions={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Generate password"
          hitSlop={8}
          className="p-xs"
          style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}
          onPress={openGenerator}
        >
          <DicesIcon size={20} color={iconColor} />
        </Pressable>
      }
    />
  );
}
