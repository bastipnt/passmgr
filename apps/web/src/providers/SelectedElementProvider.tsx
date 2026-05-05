import { createContext, useMemo, useState, type ReactNode } from "react";

export const SelectedElementContext = createContext<{
  entryId: string;
  setEntryId: (entryId: string) => void;
}>({
  entryId: "",
  setEntryId: () => {},
});

type SelectedElementProviderProps = {
  children: ReactNode;
};

export default function SelectedElementProvider({ children }: SelectedElementProviderProps) {
  const [entryId, setEntryId] = useState("");

  const value = useMemo(() => ({ entryId, setEntryId }), [entryId]);

  return <SelectedElementContext value={value}>{children}</SelectedElementContext>;
}
