import OptionToggle from "@features/password-generation/components/OptionToggle";
import type { PasswordOptions } from "@repo/crypto";
import { Field, FieldLabel } from "@repo/ui/components/Field";
import { Input } from "@repo/ui/components/Input";
import { Slider } from "@repo/ui/components/Slider";
import { clampInt } from "@repo/util";

type PasswordOptionsFormProps = {
  pwOpts: PasswordOptions;
  setPwOpts: (cb: (o: PasswordOptions) => PasswordOptions) => void;
};

export default function PasswordOptionsForm({ pwOpts, setPwOpts }: PasswordOptionsFormProps) {
  return (
    <div className="flex flex-col gap-3">
      <Field>
        <div className="flex items-center justify-between">
          <FieldLabel htmlFor="pwgen-length">Length</FieldLabel>
          <span className="text-muted-foreground text-xs tabular-nums">{pwOpts.length}</span>
        </div>
        <Slider
          id="pwgen-length"
          min={8}
          max={128}
          step={1}
          value={[pwOpts.length]}
          onValueChange={([v]) => setPwOpts((o) => ({ ...o, length: v ?? o.length }))}
        />
      </Field>

      <OptionToggle
        id="pwgen-upper"
        label="A–Z (uppercase)"
        checked={pwOpts.uppercase}
        onChange={(v) => setPwOpts((o) => ({ ...o, uppercase: v }))}
      />
      <OptionToggle
        id="pwgen-lower"
        label="a–z (lowercase)"
        checked={pwOpts.lowercase}
        onChange={(v) => setPwOpts((o) => ({ ...o, lowercase: v }))}
      />
      <OptionToggle
        id="pwgen-digits"
        label="0–9 (digits)"
        checked={pwOpts.digits}
        onChange={(v) => setPwOpts((o) => ({ ...o, digits: v }))}
      />
      <OptionToggle
        id="pwgen-symbols"
        label="!@#$ (symbols)"
        checked={pwOpts.symbols}
        onChange={(v) => setPwOpts((o) => ({ ...o, symbols: v }))}
      />
      <OptionToggle
        id="pwgen-ambiguous"
        label="Avoid ambiguous (O, 0, I, l, 1)"
        checked={pwOpts.avoidAmbiguous}
        onChange={(v) => setPwOpts((o) => ({ ...o, avoidAmbiguous: v }))}
      />

      {(pwOpts.digits || pwOpts.symbols) && (
        <div className="flex gap-3">
          {pwOpts.digits && (
            <Field>
              <FieldLabel htmlFor="pwgen-min-digits">Min digits</FieldLabel>
              <Input
                id="pwgen-min-digits"
                type="number"
                min={0}
                max={pwOpts.length}
                value={pwOpts.minDigits}
                onChange={(e) =>
                  setPwOpts((o) => ({
                    ...o,
                    minDigits: clampInt(e.target.value, 0, o.length),
                  }))
                }
              />
            </Field>
          )}
          {pwOpts.symbols && (
            <Field>
              <FieldLabel htmlFor="pwgen-min-symbols">Min symbols</FieldLabel>
              <Input
                id="pwgen-min-symbols"
                type="number"
                min={0}
                max={pwOpts.length}
                value={pwOpts.minSymbols}
                onChange={(e) =>
                  setPwOpts((o) => ({
                    ...o,
                    minSymbols: clampInt(e.target.value, 0, o.length),
                  }))
                }
              />
            </Field>
          )}
        </div>
      )}
    </div>
  );
}
