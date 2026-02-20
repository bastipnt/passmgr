import { Button } from "@repo/ui/components/Button";
import ButtonLink from "@repo/ui/components/ButtonLink";
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

export default function Index() {
  return (
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
        <ButtonLink href="/new">Create Item</ButtonLink>
        <Button variant="outline">Import</Button>
      </EmptyContent>
      <ButtonLink href="/about" variant="link" className="text-muted-foreground" size="sm">
        Learn More <ArrowUpRightIcon />
      </ButtonLink>
    </Empty>
  );
}
