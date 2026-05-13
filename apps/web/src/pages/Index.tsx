import { Button } from "@repo/ui/components/Button";
import Link from "@repo/ui/components/Link";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/Empty";
import { ArrowUpRightIcon } from "lucide-react";
import { TiFolderAdd } from "react-icons/ti";
import { useCreateEntryContext } from "@features/record/providers/CreateEntryProvider";

export default function Index() {
  const { openCreateSheet } = useCreateEntryContext();

  return (
    <div className="h-full flex flex-col justify-center items-center">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <TiFolderAdd />
          </EmptyMedia>
          <EmptyTitle>No Items Yet</EmptyTitle>
          <EmptyDescription>
            You haven&apos;t created any items yet. Get started by creating your first item.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row justify-center gap-2">
          <Button variant="default" onClick={() => openCreateSheet()}>
            Create Item
          </Button>
          <Button variant="outline">Import</Button>
        </EmptyContent>
        <Link href="/about" variant="link" className="text-muted-foreground" size="sm">
          Learn More <ArrowUpRightIcon />
        </Link>
      </Empty>
    </div>
  );
}
