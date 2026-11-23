import type { Href } from "expo-router";
import { createContext, useContext } from "react";

/** Route of the generator sheet a password field opens: differs per screen (create vs. edit). */
export const GeneratorPathContext = createContext<Href | null>(null);

export function useGeneratorPath(): Href {
  const path = useContext(GeneratorPathContext);
  if (path === null) throw new Error("useGeneratorPath must be used inside a RecordFormSheet");
  return path;
}
