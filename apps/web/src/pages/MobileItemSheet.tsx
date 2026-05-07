import { lazy, Suspense } from "react";
import { useLocation, useRoute } from "wouter";
import { VisuallyHidden } from "radix-ui";
import { Sheet, SheetContent, SheetTitle } from "@repo/ui/components/Sheet";
import { entrySlug } from "../data/routes";

const DisplayItem = lazy(() => import("@pages/DisplayItem"));

export function MobileItemSheet() {
  const [match] = useRoute(`/${entrySlug}/:entryId`);
  const [, navigate] = useLocation();

  return (
    <Sheet
      open={match}
      onOpenChange={(open) => {
        if (!open) navigate("/");
      }}
    >
      <SheetContent
        side="bottom"
        className="max-h-[90vh] overflow-y-auto data-[side=bottom]:max-w-none"
      >
        <VisuallyHidden.Root>
          <SheetTitle>Item details</SheetTitle>
        </VisuallyHidden.Root>
        <Suspense fallback={null}>{match && <DisplayItem />}</Suspense>
      </SheetContent>
    </Sheet>
  );
}
