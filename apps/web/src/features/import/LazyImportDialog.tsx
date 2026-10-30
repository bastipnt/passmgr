import { type ReactElement, Suspense } from "react";
import { lazyPreload } from "@/lib/lazy-preload";

const ImportDialog = lazyPreload(() => import("./ImportDialog"));

/** Keeps the import parsers out of the record list's chunk; the bare trigger shows until they load. */
export default function LazyImportDialog({ children }: { children: ReactElement }) {
  return (
    <Suspense fallback={children}>
      <ImportDialog>{children}</ImportDialog>
    </Suspense>
  );
}
