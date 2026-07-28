import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from "react";

type OnUse = (password: string) => void;

type PasswordGeneratorContextValue = {
  /** Registers the sink for the next generated password. */
  registerTarget: (onUse: OnUse) => void;
  /** Hands the generated password to the registered sink and clears it. */
  applyGenerated: (password: string) => void;
};

const PasswordGeneratorContext = createContext<PasswordGeneratorContextValue | null>(null);

/**
 * Bridges the generator sheet back to the field that opened it. The password is
 * passed through a ref rather than route params on purpose: navigation state is
 * serialized (and persisted by the router), and a generated secret has no
 * business being in it.
 */
export function PasswordGeneratorProvider({ children }: { children: ReactNode }) {
  const onUseRef = useRef<OnUse | null>(null);

  const registerTarget = useCallback((onUse: OnUse) => {
    onUseRef.current = onUse;
  }, []);

  const applyGenerated = useCallback((password: string) => {
    onUseRef.current?.(password);
    onUseRef.current = null;
  }, []);

  const value = useMemo(
    () => ({ registerTarget, applyGenerated }),
    [registerTarget, applyGenerated],
  );

  return (
    <PasswordGeneratorContext.Provider value={value}>{children}</PasswordGeneratorContext.Provider>
  );
}

export function usePasswordGenerator() {
  const context = useContext(PasswordGeneratorContext);
  if (!context) {
    throw new Error("usePasswordGenerator must be used inside a PasswordGeneratorProvider");
  }
  return context;
}
