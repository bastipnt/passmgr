"use client";

import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { CheckIcon, CopyIcon, RefreshCwIcon, XIcon } from "lucide-react";
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
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@repo/ui/components/Sheet";
import { PasswordStrengthBar } from "../components/PasswordStrengthBar";
import {
  PASSPHRASE_DEFAULTS,
  PASSWORD_DEFAULTS,
  type Mode,
} from "@features/password-generation/generatorOptions";
import PasswordOptionsForm from "@features/password-generation/components/PasswordOptionsForm";
import PassphraseOptionsForm from "@features/password-generation/components/PassphraseOptions";
import { useIsMobile } from "@/hooks/use-is-mobile";
import {
  Drawer,
  DrawerActions,
  DrawerContent,
  DrawerPopup,
  DrawerTitle,
} from "@repo/ui/components/Drawer";
import type { DialogHandle } from "@repo/ui/components/Dialog";

type PasswordGeneratorProps = {
  handle: DialogHandle<unknown>;
  onUse: (password: string) => void;
};

export default function PasswordGenerator({ onUse, handle }: PasswordGeneratorProps) {
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

  function Header() {
    const title = "Generate password";

    function ModeSwitch() {
      return (
        <ButtonGroup className="w-full">
          <Button
            variant={mode === "password" ? "default" : "secondary"}
            className="flex-1"
            onClick={() => setMode("password")}
          >
            Password
          </Button>
          <Button
            variant={mode === "passphrase" ? "default" : "secondary"}
            className="flex-1"
            onClick={() => setMode("passphrase")}
          >
            Passphrase
          </Button>
        </ButtonGroup>
      );
    }

    return isMobile ? (
      <div className="space-y-4">
        <DrawerTitle>{title}</DrawerTitle>
        <ModeSwitch />
      </div>
    ) : (
      <SheetHeader className="space-y-4">
        <SheetTitle>{title}</SheetTitle>
        <ModeSwitch />
      </SheetHeader>
    );
  }

  function Actions() {
    return (
      <div className="flex flex-row gap-2">
        {isMobile && (
          <Button
            variant="outline"
            size="icon"
            className="rounded-full mr-auto"
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
  }

  function Content() {
    return (
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-1.5">
          <div className="bg-muted/50 border-input min-h-9 rounded-md border px-2.5 py-2 font-mono text-sm break-all">
            {generated || (error ? <span className="text-destructive">{error}</span> : "")}
          </div>
          <PasswordStrengthBar level={strength.level} label={strength.label} bits={strength.bits} />
        </div>

        {mode === "password" ? (
          <PasswordOptionsForm pwOpts={pwOpts} setPwOpts={setPwOpts} />
        ) : (
          <PassphraseOptionsForm phOpts={phOpts} setPhOpts={setPhOpts} />
        )}
      </div>
    );
  }

  return isMobile ? (
    <Drawer open={open} onOpenChange={setOpen} handle={handle}>
      <DrawerPopup>
        <DrawerActions className="space-y-4">
          <Actions />
          <Header />
        </DrawerActions>
        <DrawerContent>
          <Content />
        </DrawerContent>
      </DrawerPopup>
    </Drawer>
  ) : (
    <Sheet open={open} onOpenChange={setOpen} handle={handle}>
      <SheetContent side="right">
        <Header />
        <div className="p-4 flex-1">
          <Content />
        </div>
        <SheetFooter>
          <Actions />
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
