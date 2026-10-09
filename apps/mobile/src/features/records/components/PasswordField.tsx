import { getStrengthFromString } from "@repo/crypto";
import { ControlledPasswordInput, StrengthMeter } from "@repo/ui-native";
import { type Href, useRouter } from "expo-router";
import { KeyIcon, WandSparkles } from "lucide-react-native";
import { type Control, type UseFormSetValue, useWatch } from "react-hook-form";
import { Pressable } from "react-native";
import { useCSSVariable } from "uniwind";
import { usePasswordGenerator } from "@/features/password-generation/PasswordGeneratorContext";

/** Any form with a `password` field: a login, a Wi-Fi network. */
type PasswordFormValues = { password?: string };

type PasswordFieldProps<T extends PasswordFormValues> = {
  control: Control<T>;
  setValue: UseFormSetValue<T>;
  /** Route of the generator sheet — differs per screen (create vs. edit). */
  generatorPath: Href;
};

export default function PasswordField<T extends PasswordFormValues>(props: PasswordFieldProps<T>) {
  // react-hook-form's paths don't narrow through a generic: pin the form to its
  // `password` field, the only one this component touches.
  const { control, setValue, generatorPath } =
    props as unknown as PasswordFieldProps<PasswordFormValues>;
  const router = useRouter();
  const { registerTarget } = usePasswordGenerator();

  const iconColor = useCSSVariable("--color-muted-foreground") as string;
  const password = useWatch({ control, name: "password" }) ?? "";
  const strength = password ? getStrengthFromString(password) : null;

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
