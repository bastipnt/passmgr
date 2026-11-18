import { Suspense } from "react";
import { useDemoMode } from "@/features/demo";
import { lazyPreload } from "@/lib/lazy-preload";
import type { ImportDialogProps } from "./ImportDialog";

const ImportDialog = lazyPreload(() => import("./ImportDialog"));

/** Keeps the import parsers out of the record list's chunk; the bare trigger shows until they load. */
export default function LazyImportDialog(props: ImportDialogProps) {
  const demoMode = useDemoMode();
  if (demoMode) return null;
  return (
    <Suspense fallback={props.children ?? null}>
      <ImportDialog {...props} />
    </Suspense>
  );
}
