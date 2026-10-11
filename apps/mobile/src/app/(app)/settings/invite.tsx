import {
  assignableRoles,
  type Invitee,
  sharingErrorMessage,
  useVaultSharing,
  useVaults,
  VAULT_ROLE_DESCRIPTIONS,
  VAULT_ROLE_LABELS,
  type VaultInfo,
} from "@repo/client";
import { emailSchema, type VaultRole } from "@repo/schema";
import { FieldError, Input, OptionList, SettingsSection } from "@repo/ui-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useCSSVariable, useResolveClassNames } from "uniwind";
import { Fingerprint } from "@/features/vaults/Fingerprint";

/**
 * Web's `InviteMemberDialog` as a form sheet: look someone up by email and
 * pick a role, then compare their security code before the vault key is
 * sealed to them.
 */
export default function InviteScreen() {
  const { vaultId } = useLocalSearchParams<{ vaultId: string }>();
  const { getVault } = useVaults();
  const vault = getVault(vaultId);
  if (!vault) return null;
  return <InviteForm vault={vault} />;
}

function InviteForm({ vault }: { vault: VaultInfo }) {
  const router = useRouter();
  const { lookupInvitee, invite, pending } = useVaultSharing();
  const roles = assignableRoles(vault.role);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<VaultRole>("write");
  const [invitee, setInvitee] = useState<Invitee>();
  const [error, setError] = useState<string>();
  const headerTitleStyle = useResolveClassNames("text-foreground");
  const [foreground, primary] = useCSSVariable([
    "--color-foreground",
    "--color-primary",
  ]) as string[];

  async function lookUp() {
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setError("Enter an email address.");
      return;
    }
    setError(undefined);
    try {
      setInvitee(await lookupInvitee(parsed.data));
    } catch (e) {
      setError(
        sharingErrorMessage(e, "They couldn't be looked up. Try again.", {
          NOT_FOUND: "There's no account with this email. They need to sign up first.",
        }),
      );
    }
  }

  async function confirm() {
    if (!invitee) return;
    setError(undefined);
    try {
      await invite(vault.vaultId, invitee, role);
      router.back();
    } catch (e) {
      setError(
        sharingErrorMessage(e, "The invite couldn't be sent. Try again.", {
          NOT_FOUND: "There's no account with this email any more.",
          BAD_REQUEST: "That's your own account.",
          CONFLICT:
            "They're already in this vault or invited, or its key just changed. Check the members and try again.",
          PRECONDITION_FAILED:
            "Their key or yours changed meanwhile, or the vault is full. Look them up again.",
        }),
      );
    }
  }

  return (
    <View className="flex-1">
      <Stack.Screen
        options={{
          headerShown: true,
          headerTransparent: true,
          headerTitleStyle,
          title: invitee ? "Compare the code" : `Share “${vault.name}”`,
          unstable_headerLeftItems: () => [
            invitee
              ? {
                  type: "button",
                  label: "Back",
                  accessibilityLabel: "Back",
                  icon: { type: "sfSymbol", name: "chevron.backward" },
                  tintColor: foreground,
                  disabled: pending,
                  onPress: () => {
                    setInvitee(undefined);
                    setError(undefined);
                  },
                }
              : {
                  type: "button",
                  label: "Close",
                  accessibilityLabel: "Close",
                  icon: { type: "sfSymbol", name: "xmark" },
                  tintColor: foreground,
                  onPress: () => router.back(),
                },
          ],
          unstable_headerRightItems: () => [
            {
              type: "button",
              label: invitee ? "Invite" : "Next",
              variant: "prominent",
              tintColor: primary,
              disabled: pending,
              onPress: () => void (invitee ? confirm() : lookUp()),
            },
          ],
        }}
      />

      <KeyboardAwareScrollView
        mode="layout"
        contentContainerClassName="grow gap-8 py-6"
        bottomOffset={24}
      >
        {invitee ? (
          <SettingsSection
            title={invitee.email}
            description="Ask them to read you the code under Settings → Vaults on their device, by phone or in person. If it matches, the vault key can only be opened by them."
          >
            <Fingerprint value={invitee.fingerprint} />
          </SettingsSection>
        ) : (
          <>
            <View className="gap-2 px-5">
              <Input
                label="Email"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                editable={!pending}
                onSubmitEditing={() => void lookUp()}
              />
              <Text className="text-muted-foreground text-xs">
                They see every item in this vault once they accept. Only people with an account can
                be invited.
              </Text>
            </View>
            <SettingsSection flush title="Role" description={VAULT_ROLE_DESCRIPTIONS[role]}>
              <OptionList
                options={roles.map((r) => ({ value: r, label: VAULT_ROLE_LABELS[r] }))}
                value={role}
                onChange={setRole}
              />
            </SettingsSection>
          </>
        )}

        {error && (
          <View className="px-5">
            <FieldError>{error}</FieldError>
          </View>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}
