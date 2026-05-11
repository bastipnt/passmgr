import OptionToggle from "@features/password-generation/components/OptionToggle";
import { SEPARATORS } from "@features/password-generation/generatorOptions";
import type { PassphraseOptions } from "@repo/crypto";
import { Field, FieldLabel } from "@repo/ui/components/Field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/Select";
import { Slider } from "@repo/ui/components/Slider";

type PassphraseOptionsFormProps = {
  phOpts: PassphraseOptions;
  setPhOpts: (cb: (o: PassphraseOptions) => PassphraseOptions) => void;
};

export default function PassphraseOptionsForm({ phOpts, setPhOpts }: PassphraseOptionsFormProps) {
  return (
    <div className="flex flex-col gap-3">
      <Field>
        <div className="flex items-center justify-between">
          <FieldLabel htmlFor="pwgen-words">Words</FieldLabel>
          <span className="text-muted-foreground text-xs tabular-nums">{phOpts.wordCount}</span>
        </div>
        <Slider
          id="pwgen-words"
          min={3}
          max={10}
          step={1}
          value={phOpts.wordCount}
          onValueChange={(v) =>
            setPhOpts((o) => ({ ...o, wordCount: (v as number) ?? o.wordCount }))
          }
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="pwgen-separator">Separator</FieldLabel>

        <Select
          value={phOpts.separator}
          onValueChange={(value) => setPhOpts((o) => ({ ...o, separator: value ?? "" }))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {SEPARATORS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>

      <OptionToggle
        id="pwgen-cap"
        label="Capitalize words"
        checked={phOpts.capitalize}
        onChange={(v) => setPhOpts((o) => ({ ...o, capitalize: v }))}
      />
      <OptionToggle
        id="pwgen-num"
        label="Include a number"
        checked={phOpts.includeNumber}
        onChange={(v) => setPhOpts((o) => ({ ...o, includeNumber: v }))}
      />
    </div>
  );
}
