"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { CheckIcon, CopyIcon, RefreshCwIcon } from "lucide-react";
import {
  EFF_WORDLIST_SIZE,
  estimateEntropy,
  estimatePassphraseEntropy,
  generatePassphrase,
  generatePassword,
  getCharsetSize,
  getStrength,
  PasswordGeneratorError,
  type PassphraseOptions,
  type PasswordOptions,
} from "@repo/crypto";

import { Button } from "@repo/ui/components/Button";
import { ButtonGroup } from "@repo/ui/components/ButtonGroup";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@repo/ui/components/Sheet";
import { PasswordStrengthBar } from "./PasswordStrengthBar";
import {
  PASSPHRASE_DEFAULTS,
  PASSWORD_DEFAULTS,
  type Mode,
} from "@features/password-generation/generatorOptions";
import PasswordOptionsForm from "@features/password-generation/components/PasswordOptionsForm";
import PassphraseOptionsForm from "@features/password-generation/components/PassphraseOptions";
import { useIsMobile } from "@/hooks/use-is-mobile";

type PasswordGeneratorSheetProps = {
  children: ReactNode;
  onUse: (password: string) => void;
};

export default function PasswordGeneratorSheet({ children, onUse }: PasswordGeneratorSheetProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("password");
  const [pwOpts, setPwOpts] = useState<PasswordOptions>(PASSWORD_DEFAULTS);
  const [phOpts, setPhOpts] = useState<PassphraseOptions>(PASSPHRASE_DEFAULTS);
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

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className="overflow-y-auto flex flex-col gap-0 data-[side=bottom]:max-h-[90vh]"
      >
        <SheetHeader>
          <SheetTitle>Generate password</SheetTitle>
          <SheetDescription>
            Tweak the options. Click Use to fill the password field.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-2">
          <ButtonGroup className="w-full">
            <Button
              variant={mode === "password" ? "default" : "secondary"}
              size="sm"
              className="flex-1"
              onClick={() => setMode("password")}
            >
              Password
            </Button>
            <Button
              variant={mode === "passphrase" ? "default" : "secondary"}
              size="sm"
              className="flex-1"
              onClick={() => setMode("passphrase")}
            >
              Passphrase
            </Button>
          </ButtonGroup>

          <div className="flex flex-col gap-1.5">
            <div className="bg-muted/50 border-input min-h-9 rounded-md border px-2.5 py-2 font-mono text-sm break-all">
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

        <SheetFooter>
          <div className="flex flex-row gap-2">
            <Button variant="outline" size="sm" onClick={handleCopy} disabled={!generated}>
              {copied ? <CheckIcon /> : <CopyIcon />}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button variant="outline" size="sm" onClick={regenerate}>
              <RefreshCwIcon />
              Regenerate
            </Button>
            <Button
              size="sm"
              className="ml-auto"
              onClick={handleUse}
              disabled={!generated || noCharset}
            >
              Use
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
