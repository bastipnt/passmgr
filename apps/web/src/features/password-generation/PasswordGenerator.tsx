"use client";

import { ShortcutLayer, useGeneratorDefaults } from "@repo/client";
import {
  EFF_WORDLIST_SIZE,
  estimateEntropy,
  estimatePassphraseEntropy,
  type GeneratorMode,
  generatePassphrase,
  generatePassword,
  getCharsetSize,
  getStrength,
  type PassphraseOptions,
  PasswordGeneratorError,
  type PasswordOptions,
} from "@repo/crypto";
import { ResponsiveSheet } from "@repo/ui/complex-components/ResponsiveSheet";
import { Button } from "@repo/ui/components/Button";
import type { DialogHandle } from "@repo/ui/components/Dialog";
import { useIsMobile } from "@repo/ui/hooks/use-is-mobile";
import { CheckIcon, CopyIcon, RefreshCwIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import GeneratorModeSwitch from "./GeneratorModeSwitch";
import PassphraseOptionsForm from "./PassphraseOptionsForm";
import PasswordOptionsForm from "./PasswordOptionsForm";
import { PasswordStrengthBar } from "./PasswordStrengthBar";

type PasswordGeneratorProps = {
  handle: DialogHandle<unknown>;
  onUse: (password: string) => void;
};

const TITLE = "Generate password";

export default function PasswordGenerator({ onUse, handle }: PasswordGeneratorProps) {
  const {
    mode: defaultMode,
    pwOpts: defaultPwOpts,
    phOpts: defaultPhOpts,
  } = useGeneratorDefaults();

  const [open, setOpen] = useState(false);
  // Seeded from the saved defaults; edits here are for this password only and
  // are thrown away when the sheet closes.
  const [mode, setMode] = useState<GeneratorMode>(defaultMode);
  const [pwOpts, setPwOpts] = useState<PasswordOptions>(defaultPwOpts);
  const [phOpts, setPhOpts] = useState<PassphraseOptions>(defaultPhOpts);
  const [generated, setGenerated] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const isMobile = useIsMobile();

  const noCharset = !pwOpts.uppercase && !pwOpts.lowercase && !pwOpts.digits && !pwOpts.symbols;

  const regenerate = useCallback(async () => {
    setError(null);
    try {
      if (mode === "password") {
        setGenerated(generatePassword(pwOpts));
      } else {
        setGenerated(await generatePassphrase(phOpts));
      }
    } catch (e) {
      if (e instanceof PasswordGeneratorError) setError(e.message);
      else throw e;
    }
  }, [mode, pwOpts, phOpts]);

  // The sheet stays mounted between opens, so discard the previous session's
  // tweaks and start from the saved defaults again.
  useEffect(() => {
    if (!open) return;
    setMode(defaultMode);
    setPwOpts(defaultPwOpts);
    setPhOpts(defaultPhOpts);
  }, [open, defaultMode, defaultPwOpts, defaultPhOpts]);

  useEffect(() => {
    if (!open) return;
    void regenerate();
  }, [open, regenerate]);

  const entropy = useMemo(() => {
    if (mode === "password") {
      return estimateEntropy(pwOpts.length, getCharsetSize(pwOpts));
    }
    return estimatePassphraseEntropy(phOpts.wordCount, EFF_WORDLIST_SIZE);
  }, [mode, pwOpts, phOpts]);

  const strength = getStrength(entropy);

  async function handleCopy() {
    if (!generated) return;
    await navigator.clipboard.writeText(generated);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleUse() {
    if (!generated || noCharset) return;
    onUse(generated);
    setOpen(false);
  }

  const actions = (
    <div className="flex flex-row gap-2">
      {isMobile && (
        <Button
          variant="outline"
          size="icon"
          className="mr-auto rounded-full"
          onClick={() => setOpen(false)}
        >
          <XIcon />
        </Button>
      )}
      <Button variant="outline" onClick={handleCopy} disabled={!generated}>
        {copied ? <CheckIcon /> : <CopyIcon />}
        {copied ? "Copied" : "Copy"}
      </Button>
      <Button variant="outline" onClick={regenerate}>
        <RefreshCwIcon />
        Regenerate
      </Button>
      <Button className="sm:ml-auto" onClick={handleUse} disabled={!generated || noCharset}>
        Use
      </Button>
    </div>
  );

  return (
    <ShortcutLayer active={open}>
      <ResponsiveSheet
        open={open}
        handle={handle}
        onOpenChange={setOpen}
        title={TITLE}
        actions={actions}
      >
        <div className="flex flex-col gap-8 p-4">
          <GeneratorModeSwitch mode={mode} setMode={setMode} />

          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-1.5">
              <div className="min-h-9 break-all rounded-md border border-input bg-muted/50 px-2.5 py-2 font-mono text-sm">
                {generated || (error ? <span className="text-destructive">{error}</span> : "")}
              </div>
              <PasswordStrengthBar
                level={strength.level}
                label={strength.label}
                bits={strength.bits}
              />
            </div>

            {mode === "password" ? (
              <PasswordOptionsForm pwOpts={pwOpts} setPwOpts={setPwOpts} />
            ) : (
              <PassphraseOptionsForm phOpts={phOpts} setPhOpts={setPhOpts} />
            )}
          </div>
        </div>
      </ResponsiveSheet>
    </ShortcutLayer>
  );
}
