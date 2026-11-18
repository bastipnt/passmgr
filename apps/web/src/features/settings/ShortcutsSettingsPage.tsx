import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@repo/ui/components/Item";
import { Kbd } from "@repo/ui/components/Kbd";
import Link from "@repo/ui/components/Link";
import { recordPaths } from "@/app/route-paths";
import { PanelHeader, PanelTitle } from "@/components/AppShell";

export default function ShortcutsSettingsPage() {
  return (
    <>
      <PanelHeader>
        <PanelTitle>Keyboard shortcuts</PanelTitle>
      </PanelHeader>
      <div className="px-4 pb-4">
        <ItemGroup>
          <Item variant="outline">
            <ItemContent>
              <ItemTitle>Keyboard shortcuts</ItemTitle>
              <ItemDescription>
                Press <Kbd>?</Kbd> in your vault to list them.
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <Link variant="outline" size="sm" href={recordPaths.shortcuts}>
                Show
              </Link>
            </ItemActions>
          </Item>
        </ItemGroup>
      </div>
    </>
  );
}
