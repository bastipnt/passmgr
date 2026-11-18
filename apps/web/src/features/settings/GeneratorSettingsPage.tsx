import { useGeneratorPreferences, usePasswordStrength } from "@repo/client";
import {
  type GeneratorMode,
  generatePassphrase,
  generatePassword,
  PASSPHRASE_WORDS_RANGE,
  PASSWORD_LENGTH_RANGE,
  type PassphraseOptions,
  PasswordGeneratorError,
  type PasswordOptions,
  SEPARATORS,
} from "@repo/crypto";
import { Button } from "@repo/ui/components/Button";
import { Slider } from "@repo/ui/components/Slider";
import { StatusPill } from "@repo/ui/components/StatusPill";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import type { StatusTone } from "@repo/ui/lib/tone";
import type { PasswordStrengthLevel } from "@repo/util";
import { RefreshCwIcon } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { SettingsChoiceRow } from "./SettingsChoiceRow";
import { SettingsGroup } from "./SettingsGroup";
import { SettingsPage } from "./SettingsPage";
import { SettingsRow, SettingsSegmented, SettingsSwitch } from "./SettingsRow";

const MODES = [
  { value: "password", label: "Password" },
  { value: "passphrase", label: "Passphrase" },
] as const;

const STRENGTH_TONE: Record<PasswordStrengthLevel, StatusTone> = {
  weak: "destructive",
  fair: "warning",
  strong: "success",
  "very-strong": "success",
};

/** A sample of what the defaults generate, regenerated whenever they change. */
function useSample(mode: GeneratorMode, pwOpts: PasswordOptions, phOpts: PassphraseOptions) {
  const [sample, setSample] = useState("");
  const latest = useRef(0);
  const regenerate = useCallback(async () => {
    // A passphrase waits for the word list: one started earlier mustn't land over a newer sample.
    const request = ++latest.current;
    let next = "";
    try {
      next = mode === "password" ? generatePassword(pwOpts) : await generatePassphrase(phOpts);
    } catch (error) {
      if (!(error instanceof PasswordGeneratorError)) throw error;
    }
    if (request === latest.current) setSample(next);
  }, [mode, pwOpts, phOpts]);
  useEffect(() => {
    void regenerate();
  }, [regenerate]);
  return { sample, regenerate };
}

function SampleCard({ sample, onRegenerate }: { sample: string; onRegenerate: () => void }) {
  const isMobile = useIsMobile();
  const strength = usePasswordStrength(sample || undefined);
  const pill = strength && (
    <StatusPill tone={STRENGTH_TONE[strength.level]}>{strength.label}</StatusPill>
  );

  return (
    <section
      aria-label="Sample"
      className="flex items-center gap-4 rounded-2xl border border-border bg-muted/50 px-5 py-4 max-sm:flex-col max-sm:items-stretch max-sm:gap-3 max-sm:px-4.5"
    >
      <code className="min-w-0 flex-1 break-all font-mono text-base tracking-[0.03em]">
        {sample}
      </code>
      {isMobile ? (
        <div className="flex items-center justify-between gap-3">
          {pill}
          <Button variant="outline" size="sm" onClick={onRegenerate}>
            Try another
          </Button>
        </div>
      ) : (
        <>
          {pill}
          <Button
            variant="outline"
            size="icon"
            aria-label="Generate another sample"
            onClick={onRegenerate}
          >
            <RefreshCwIcon />
          </Button>
        </>
      )}
    </section>
  );
}

/** A range as a slider with its value beside it; stored (and the sample redone) once let go. */
function RangeRow({
  label,
  value,
  range,
  onValueChange,
}: {
  label: string;
  value: number;
  range: { min: number; max: number };
  onValueChange: (value: number) => void;
}) {
  const labelId = useId();
  const [draft, setDraft] = useState<number>();
  const shown = draft ?? value;
  const slider = (
    <Slider
      aria-labelledby={labelId}
      min={range.min}
      max={range.max}
      step={1}
      value={shown}
      onValueChange={(next) => setDraft(next as number)}
      onValueCommitted={(next) => {
        setDraft(undefined);
        onValueChange(next as number);
      }}
      className="sm:w-70"
    />
  );
  return (
    <SettingsRow
      label={<span id={labelId}>{label}</span>}
      control={
        <>
          {slider}
          <span className="w-8 text-right font-semibold tabular-nums" aria-hidden="true">
            {shown}
          </span>
        </>
      }
      stackOnPhone
    />
  );
}

/** What the generator guarantees of a set; a count stored by an older version shows as it is. */
function minimumHint(minimum: number) {
  return minimum > 0 ? `At least ${minimum}` : undefined;
}

/** Minimums that still fit a shorter length (the stored options would be thrown out otherwise). */
function withLength(options: PasswordOptions, length: number): PasswordOptions {
  const minDigits = Math.min(options.minDigits, length);
  return {
    ...options,
    length,
    minDigits,
    minSymbols: Math.min(options.minSymbols, length - minDigits),
  };
}

function PasswordDefaults({
  pwOpts,
  setPwOpts,
}: {
  pwOpts: PasswordOptions;
  setPwOpts: (options: PasswordOptions) => void;
}) {
  // The minimums are fixed at one of each set that is on (no count to pick): any change writes that.
  const set = (patch: Partial<PasswordOptions>) => {
    const next = { ...pwOpts, ...patch };
    setPwOpts({ ...next, minDigits: next.digits ? 1 : 0, minSymbols: next.symbols ? 1 : 0 });
  };
  // The last character set stays on: the generator needs one.
  const onlySet =
    [pwOpts.uppercase, pwOpts.lowercase, pwOpts.digits, pwOpts.symbols].filter(Boolean).length ===
    1;
  const charset = (key: "uppercase" | "lowercase" | "digits" | "symbols", label: string) => (
    <SettingsRow
      label={label}
      hint={minimumHint(
        key === "digits" ? pwOpts.minDigits : key === "symbols" ? pwOpts.minSymbols : 0,
      )}
      control={
        <SettingsSwitch
          checked={pwOpts[key]}
          disabled={pwOpts[key] && onlySet}
          onCheckedChange={(on) => set({ [key]: on })}
        />
      }
    />
  );

  return (
    <SettingsGroup label="Characters">
      {charset("uppercase", "Uppercase A–Z")}
      {charset("lowercase", "Lowercase a–z")}
      {charset("digits", "Digits 0–9")}
      {charset("symbols", "Symbols !@#$")}
      <SettingsRow
        label="Avoid look-alikes"
        hint="Leaves out O, 0, I, l and 1"
        control={
          <SettingsSwitch
            checked={pwOpts.avoidAmbiguous}
            onCheckedChange={(on) => set({ avoidAmbiguous: on })}
          />
        }
      />
    </SettingsGroup>
  );
}

function PassphraseDefaults({
  phOpts,
  setPhOpts,
}: {
  phOpts: PassphraseOptions;
  setPhOpts: (options: PassphraseOptions) => void;
}) {
  const set = (patch: Partial<PassphraseOptions>) => setPhOpts({ ...phOpts, ...patch });
  return (
    <SettingsGroup label="Words">
      <SettingsChoiceRow
        label="Separator"
        choices={SEPARATORS}
        value={phOpts.separator}
        onValueChange={(separator) => set({ separator })}
      />
      <SettingsRow
        label="Capitalize words"
        control={
          <SettingsSwitch
            checked={phOpts.capitalize}
            onCheckedChange={(on) => set({ capitalize: on })}
          />
        }
      />
      <SettingsRow
        label="Include a number"
        control={
          <SettingsSwitch
            checked={phOpts.includeNumber}
            onCheckedChange={(on) => set({ includeNumber: on })}
          />
        }
      />
    </SettingsGroup>
  );
}

/** What the generator opens with; a sample shows what that gives. */
export default function GeneratorSettingsPage() {
  const isMobile = useIsMobile();
  const { mode, setMode, pwOpts, setPwOpts, phOpts, setPhOpts, resetToDefaults } =
    useGeneratorPreferences();
  const { sample, regenerate } = useSample(mode, pwOpts, phOpts);
  const reset = (
    <Button
      variant="outline"
      onClick={resetToDefaults}
      className="max-sm:w-full"
      size={isMobile ? "lg" : "default"}
    >
      Reset to defaults
    </Button>
  );

  const length =
    mode === "password" ? (
      <RangeRow
        label="Length"
        value={pwOpts.length}
        range={PASSWORD_LENGTH_RANGE}
        onValueChange={(next) => setPwOpts(withLength(pwOpts, next))}
      />
    ) : (
      <RangeRow
        label="Words"
        value={phOpts.wordCount}
        range={PASSPHRASE_WORDS_RANGE}
        onValueChange={(next) => setPhOpts({ ...phOpts, wordCount: next })}
      />
    );

  return (
    <SettingsPage
      title="Password generator"
      description="What the generator starts with. Changes inside the generator apply to that one password."
      action={isMobile ? undefined : reset}
    >
      <SampleCard sample={sample} onRegenerate={() => void regenerate()} />
      <SettingsGroup label="Defaults">
        <SettingsRow
          label="Opens with"
          hint="Passphrases are easier to type, passwords are shorter."
          stackOnPhone
          control={<SettingsSegmented options={MODES} value={mode} onValueChange={setMode} />}
        />
        {length}
      </SettingsGroup>
      {mode === "password" ? (
        <PasswordDefaults pwOpts={pwOpts} setPwOpts={setPwOpts} />
      ) : (
        <PassphraseDefaults phOpts={phOpts} setPhOpts={setPhOpts} />
      )}
      {isMobile && reset}
    </SettingsPage>
  );
}
