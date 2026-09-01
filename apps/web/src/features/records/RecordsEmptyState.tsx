import { Button } from "@repo/ui/components/Button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/Empty";
import Link from "@repo/ui/components/Link";
import { ArrowUpRightIcon } from "lucide-react";
import { TiFolderAdd } from "react-icons/ti";
import { createSheetSearch } from "./CreateRecordSheet";

export default function RecordsEmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <TiFolderAdd />
          </EmptyMedia>
          <EmptyTitle>No Records Yet</EmptyTitle>
          <EmptyDescription>
            You haven&apos;t created any records yet. Get started by creating your first record.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row justify-center gap-2">
          <Link variant="default" href={createSheetSearch()}>
            Create Record
          </Link>
          <Button variant="outline">Import</Button>
        </EmptyContent>
        <Link href="/about" variant="link" className="text-muted-foreground" size="sm">
          Learn More <ArrowUpRightIcon />
        </Link>
      </Empty>
    </div>
  );
}
