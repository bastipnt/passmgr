import { createContext, type ReactNode, useMemo, useState } from "react";

const SelectedElementContext = createContext<{
  recordId: string;
  setRecordId: (recordId: string) => void;
}>({
  recordId: "",
  setRecordId: () => {},
});

type SelectedElementProviderProps = {
  children: ReactNode;
};

export default function SelectedElementProvider({ children }: SelectedElementProviderProps) {
  const [recordId, setRecordId] = useState("");

  const value = useMemo(() => ({ recordId, setRecordId }), [recordId]);

  return <SelectedElementContext value={value}>{children}</SelectedElementContext>;
}
