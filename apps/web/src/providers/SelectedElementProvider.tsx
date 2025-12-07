import { createContext, useState, type ReactNode } from "react";

// eslint-disable-next-line react-refresh/only-export-components
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

  return (
    <SelectedElementContext value={{ entryId, setEntryId }}>{children}</SelectedElementContext>
  );
}
