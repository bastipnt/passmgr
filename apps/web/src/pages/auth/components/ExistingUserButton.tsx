import { useStore } from "@repo/client";
import RemoveDialog from "@repo/ui/complex-components/RemoveDialog";
import { Avatar, AvatarFallback } from "@repo/ui/components/Avatar";
import { Button } from "@repo/ui/components/Button";
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@repo/ui/components/Item";
import { StackedButton } from "@repo/ui/components/StackedButton";
import { TrashIcon } from "lucide-react";

type ExistingUserButtonProps = {
  storedEmail: string;
  toggleSwitchUser: () => void;
};

export default function ExistingUserButton({
  storedEmail,
  toggleSwitchUser,
}: ExistingUserButtonProps) {
  const store = useStore();

  return (
    <StackedButton>
      <Button onClick={toggleSwitchUser} variant="outline" className="h-auto">
        <Item variant="default" className="px-0">
          <ItemMedia>
            <Avatar>
              <AvatarFallback>{storedEmail.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
          </ItemMedia>
          <ItemContent className="gap-1">
            <ItemTitle>{storedEmail}</ItemTitle>
            <ItemDescription className="line-clamp-1">Unlock existing vault</ItemDescription>
          </ItemContent>
        </Item>
      </Button>

      <RemoveDialog
        title="Remove vault"
        description="This will remove the local vault data from this device. Your account and server data are not affected. You can log in again with your credentials."
        removeTitle="Remove vault"
        onRemove={() => store.removeVault()}
      >
        <Button
          variant="destructive"
          title="Remove vault from this device"
          className="text-muted-foreground text-xs"
        >
          <TrashIcon />
        </Button>
      </RemoveDialog>
    </StackedButton>
  );
}
