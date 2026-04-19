import { createContext, useContext, useState, type ReactNode } from "react";

type EditingContextValue = {
  isEditing: boolean;
  setIsEditing: (editing: boolean) => void;
};

const EditingContext = createContext<EditingContextValue | null>(null);

export function useEditingContext() {
  const ctx = useContext(EditingContext);
  if (!ctx) throw new Error("useEditingContext must be used within EditingProvider");
  return ctx;
}

type EditingProviderProps = {
  children: ReactNode;
};

export default function EditingProvider({ children }: EditingProviderProps) {
  const [isEditing, setIsEditing] = useState(false);

  return <EditingContext value={{ isEditing, setIsEditing }}>{children}</EditingContext>;
}
