import { zodResolver } from "@hookform/resolvers/zod";
import {
  CARD_BRAND_LABELS,
  cardDigits,
  caretAfterDigits,
  detectCardBrand,
  type FormFieldSpec,
  formatCardExpiry,
  formatCardNumber,
  isLuhnValid,
  RECORD_FORM_FIELDS,
} from "@repo/client";
import { generateSshKeyPair, sshKeyFingerprint } from "@repo/crypto";
import {
  type CustomField,
  type RecordFormValues,
  type RecordType,
  recordFormSchemas,
} from "@repo/schema";
import {
  Button,
  ControlledInput,
  ControlledPasswordInput,
  ControlledTextarea,
  FieldError,
  FieldGroup,
  FieldSeparator,
  FieldSet,
  FormLock,
  Input,
  OptionToggle,
  SegmentedControl,
  Textarea,
} from "@repo/ui-native";
import type { Href } from "expo-router";
import {
  CalendarDays,
  CreditCard,
  EyeOff,
  KeyRound,
  Lock,
  type LucideIcon,
  Mail,
  NotebookPen,
  Phone,
  ShieldCheck,
  Tag,
  Type,
} from "lucide-react-native";
import { type ReactNode, type Ref, useImperativeHandle, useRef, useState } from "react";
import { type Control, Controller, type UseFormSetValue, useForm, useWatch } from "react-hook-form";
import { Alert, type KeyboardTypeOptions, Pressable, Text, View } from "react-native";
import { useCSSVariable } from "uniwind";
import ExtraFormFields from "./ExtraFormFields";
import PasswordField from "./PasswordField";
import type { RecordFormHandle } from "./RecordFormSheet";

export type OtherRecordType = Exclude<RecordType, "login">;

/**
 * One form for six shapes: typed loosely by key, validated by the type's own
 * schema. The common fields keep their types for the shared inputs.
 */
type AnyFormValues = Record<string, unknown> & {
  title: string;
  note?: string;
  password?: string;
  customFields?: CustomField[];
};

type FieldProps = {
  spec: FormFieldSpec;
  control: Control<AnyFormValues>;
  setValue: UseFormSetValue<AnyFormValues>;
  generatorPath: Href;
  iconColor: string;
};

const KEYBOARDS: Record<NonNullable<FormFieldSpec["input"]>, KeyboardTypeOptions> = {
  email: "email-address",
  phone: "phone-pad",
  numeric: "number-pad",
  date: "numbers-and-punctuation",
};

const TEXT_ICONS: Record<NonNullable<FormFieldSpec["input"]>, LucideIcon> = {
  email: Mail,
  phone: Phone,
  numeric: Type,
  date: CalendarDays,
};

/**
 * The icon column the controlled inputs draw (`icon` prop), for controls that
 * have none: every field lines up with the login form's.
 */
function WithIcon({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <View className="flex-row items-start gap-2">
      <View className="shrink-0 pt-0.5">{icon}</View>
      <View className="flex-1">{children}</View>
    </View>
  );
}

/** Shortest card number: below it the checksum says nothing yet. */
const MIN_CARD_DIGITS = 12;

// TODO: inputs should go in separate files (mobile ui blocks)

/** Web's `CardNumberField`: grouped while typing, the network or a typo hint below. */
function CardNumberInput({ spec, control, iconColor }: FieldProps) {
  // The caret before the edit, and where to put it after regrouping: a
  // controlled TextInput otherwise jumps it to the end on every keystroke.
  const caretRef = useRef(0);
  const [selection, setSelection] = useState<{ start: number; end: number }>();

  return (
    <Controller
      control={control}
      name={spec.key}
      render={({ field, fieldState }) => {
        const number = (field.value as string | undefined) ?? "";
        const brand = detectCardBrand(number);
        const digits = cardDigits(number);
        const checksumFails = digits.length >= MIN_CARD_DIGITS && !isLuhnValid(digits);

        return (
          <View className="flex-row items-start gap-2">
            <View className="shrink-0 pt-0.5">
              <CreditCard size={18} color={iconColor} />
            </View>
            <Input
              label={spec.label}
              value={formatCardNumber(number)}
              selection={selection}
              onSelectionChange={({ nativeEvent }) => {
                caretRef.current = nativeEvent.selection.end;
                if (selection) setSelection(undefined);
              }}
              onChangeText={(text) => {
                const previous = formatCardNumber(number);
                const formatted = formatCardNumber(text);
                field.onChange(formatted);
                // Where the caret is now: past what was typed, or at the deletion.
                const caret = caretRef.current + (text.length - previous.length);
                if (formatted !== text && caret < text.length) {
                  const position = caretAfterDigits(
                    formatted,
                    cardDigits(text.slice(0, Math.max(caret, 0))).length,
                  );
                  setSelection({ start: position, end: position });
                }
              }}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              keyboardType="number-pad"
              autoComplete="off"
              inputClassName="font-mono"
              note={
                checksumFails ? (
                  <Text className="text-amber-700 text-xs dark:text-amber-400">
                    This number doesn&apos;t look right. Check it for a typo.
                  </Text>
                ) : brand ? (
                  <Text className="text-muted-foreground text-xs">{CARD_BRAND_LABELS[brand]}</Text>
                ) : undefined
              }
            />
          </View>
        );
      }}
    />
  );
}

/** "MM/YY", the slash typed for you. */
function CardExpiryInput({ spec, control, iconColor }: FieldProps) {
  return (
    <Controller
      control={control}
      name={spec.key}
      render={({ field, fieldState }) => {
        const expiry = (field.value as string | undefined) ?? "";
        return (
          <View className="flex-row items-start gap-2">
            <View className="shrink-0 pt-0.5">
              <CalendarDays size={18} color={iconColor} />
            </View>
            <Input
              label={spec.label}
              value={expiry}
              onChangeText={(text) => field.onChange(formatCardExpiry(text, expiry))}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              keyboardType="number-pad"
              placeholder="MM/YY"
              maxLength={5}
              autoComplete="off"
            />
          </View>
        );
      }}
    />
  );
}

/**
 * A multi-line secret (a private key): multi-line inputs can't mask, so the
 * text stays out of view until revealed.
 */
function SecretTextarea({ spec, control }: FieldProps) {
  const [revealed, setRevealed] = useState(false);

  return (
    <Controller
      control={control}
      name={spec.key}
      render={({ field, fieldState }) => {
        const value = (field.value as string | undefined) ?? "";
        if (value && !revealed) {
          return (
            <View className="gap-2">
              <Text className="font-medium text-foreground text-sm">{spec.label}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Show ${spec.label.toLowerCase()}`}
                onPress={() => setRevealed(true)}
                className="h-12 flex-row items-center justify-between rounded-xl border border-foreground/10 px-3.5 dark:border-white/10"
              >
                <Text className="font-mono text-muted-foreground">••••••••••••</Text>
                <Text className="font-semibold text-primary text-sm">Show</Text>
              </Pressable>
            </View>
          );
        }
        return (
          <Textarea
            label={spec.label}
            value={value}
            onChangeText={field.onChange}
            onBlur={() => {
              field.onBlur();
              setRevealed(false);
            }}
            error={fieldState.error?.message}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            className="font-mono text-xs"
            placeholder="Paste the key file's contents"
          />
        );
      }}
    />
  );
}

function FormField(props: FieldProps) {
  const { spec, control, setValue, generatorPath, iconColor } = props;
  const keyboardType = spec.input ? KEYBOARDS[spec.input] : undefined;

  switch (spec.kind) {
    case "text": {
      const Icon = spec.input ? TEXT_ICONS[spec.input] : Type;
      return (
        <ControlledInput
          control={control}
          name={spec.key}
          label={spec.label}
          icon={<Icon size={18} color={iconColor} />}
          placeholder={spec.input === "date" ? "YYYY-MM-DD" : spec.placeholder}
          keyboardType={keyboardType}
          autoCapitalize={spec.input || spec.mono ? "none" : undefined}
          autoComplete="off"
          inputClassName={spec.mono ? "font-mono" : undefined}
        />
      );
    }

    case "secret":
      return (
        <ControlledPasswordInput
          control={control}
          name={spec.key}
          label={spec.label}
          keyboardType={keyboardType}
          autoComplete="off"
          icon={<Lock size={18} color={iconColor} />}
        />
      );

    case "password":
      return <PasswordField control={control} setValue={setValue} generatorPath={generatorPath} />;

    case "multiline":
      return (
        <ControlledTextarea
          control={control}
          name={spec.key}
          label={spec.label}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          className="font-mono text-xs"
          icon={<KeyRound size={18} color={iconColor} />}
          note={spec.key === "publicKey" ? <FingerprintNote control={control} /> : undefined}
        />
      );

    case "secretMultiline":
      return (
        <WithIcon icon={<Lock size={18} color={iconColor} />}>
          <SecretTextarea {...props} />
        </WithIcon>
      );

    case "cardNumber":
      return <CardNumberInput {...props} />;

    case "cardExpiry":
      return <CardExpiryInput {...props} />;

    case "select":
      return (
        <Controller
          control={control}
          name={spec.key}
          render={({ field }) => (
            <WithIcon icon={<ShieldCheck size={18} color={iconColor} />}>
              <View className="gap-2">
                <Text className="font-medium text-foreground text-sm">{spec.label}</Text>
                <SegmentedControl
                  value={(field.value as string | undefined) ?? ""}
                  options={spec.options ?? []}
                  onChange={field.onChange}
                />
              </View>
            </WithIcon>
          )}
        />
      );

    case "toggle":
      return (
        <Controller
          control={control}
          name={spec.key}
          render={({ field }) => (
            <WithIcon icon={<EyeOff size={18} color={iconColor} />}>
              <OptionToggle
                label={spec.label}
                checked={Boolean(field.value)}
                onChange={field.onChange}
              />
            </WithIcon>
          )}
        />
      );
  }
}

/** The public key's fingerprint, once the field holds a valid key. */
function FingerprintNote({ control }: { control: Control<AnyFormValues> }) {
  const publicKey = (useWatch({ control, name: "publicKey" }) as string | undefined) ?? "";
  const fingerprint = publicKey ? sshKeyFingerprint(publicKey) : undefined;
  if (!fingerprint) return null;
  return <Text className="font-mono text-muted-foreground text-xs">{fingerprint}</Text>;
}

const SET = { shouldDirty: true, shouldValidate: true } as const;

/**
 * Web's `SshKeyActions`, without the file import: a key file is pasted into
 * the private key field, and its public key is filled in on save.
 */
function GenerateSshKey({
  control,
  setValue,
}: {
  control: Control<AnyFormValues>;
  setValue: UseFormSetValue<AnyFormValues>;
}) {
  const privateKey = useWatch({ control, name: "privateKey" }) as string | undefined;

  function generate() {
    // No comment: the public key line gets pasted into servers and code hosts,
    // and a record title may say more than it should there.
    const pair = generateSshKeyPair();
    setValue("privateKey", pair.privateKey, SET);
    setValue("publicKey", pair.publicKey, SET);
    setValue("passphrase", "", SET);
  }

  function onPress() {
    if (!privateKey) return generate();
    // Generating over a key would silently lose it from the form.
    Alert.alert(
      "Replace this key?",
      "The new key replaces the one in this form. The old key stays in the record's history once you save.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Replace", style: "destructive", onPress: generate },
      ],
    );
  }

  return (
    <Button variant="glass" systemImage="sparkles" onPress={onPress}>
      Generate Ed25519 key
    </Button>
  );
}

type TypedRecordFormProps<T extends OtherRecordType> = {
  type: T;
  onSubmit: (data: RecordFormValues<T>) => void;
  /** Route of the generator sheet a password field opens. */
  generatorPath: Href;
  serverError?: string;
  /** Locks every field while a save is in flight. */
  disabled?: boolean;
  defaultValues?: Partial<RecordFormValues<T>>;
  ref?: Ref<RecordFormHandle>;
};

/**
 * Web's `TypedRecordForm`: title, the type's inputs (shared
 * `RECORD_FORM_FIELDS`), note and extra fields. A secure note is all note.
 */
export default function TypedRecordForm<T extends OtherRecordType>({
  type,
  onSubmit,
  generatorPath,
  serverError,
  disabled = false,
  defaultValues,
  ref,
}: TypedRecordFormProps<T>) {
  const iconColor = useCSSVariable("--color-muted-foreground") as string;
  const { register, handleSubmit, formState, control, setValue } = useForm<AnyFormValues>({
    resolver: zodResolver(recordFormSchemas[type] as never),
    defaultValues: defaultValues as Partial<AnyFormValues>,
  });
  const isNote = type === "note";
  const fields = RECORD_FORM_FIELDS[type] as readonly FormFieldSpec[];

  useImperativeHandle(
    ref,
    () => ({ triggerSubmit: handleSubmit((data) => onSubmit(data as RecordFormValues<T>)) }),
    [handleSubmit, onSubmit],
  );

  const noteField = (
    <ControlledTextarea
      control={control}
      name="note"
      label={isNote ? "Note" : "Notes"}
      autoComplete="off"
      className={isNote ? "min-h-[240px]" : undefined}
      icon={isNote ? undefined : <NotebookPen size={18} color={iconColor} />}
    />
  );

  return (
    <FormLock locked={disabled}>
      <FieldGroup className="*:pr-8">
        <FieldSet>
          <ControlledInput
            control={control}
            name="title"
            label="Title"
            autoComplete="off"
            icon={<Tag size={18} color={iconColor} />}
          />
          {isNote && noteField}
          {fields.map((spec) => (
            <FormField
              key={spec.key}
              spec={spec}
              control={control}
              setValue={setValue}
              generatorPath={generatorPath}
              iconColor={iconColor}
            />
          ))}
          {type === "ssh_key" && <GenerateSshKey control={control} setValue={setValue} />}
        </FieldSet>

        {!isNote && (
          <>
            <FieldSeparator />
            <FieldSet>{noteField}</FieldSet>
          </>
        )}

        <FieldSeparator />

        <ExtraFormFields control={control} register={register} errors={formState.errors} />

        {serverError && <FieldError>{serverError}</FieldError>}
      </FieldGroup>
    </FormLock>
  );
}
