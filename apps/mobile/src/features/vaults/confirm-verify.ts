import type { MemberInfo } from "@repo/client";
import { Alert } from "react-native";

/** Ask the user to compare `member`'s security code before it's pinned (`verifyMember`). */
export function confirmVerify(member: MemberInfo, onVerified: () => void) {
  Alert.alert(
    `Verify ${member.email}?`,
    `${member.keyTrusted ? "" : "Their key changed since this device last used it. "}Does their security code read ${member.fingerprint}? Compare it with them, by phone or in person.`,
    [
      { text: "Cancel", style: "cancel" },
      { text: "Codes match", onPress: onVerified },
    ],
  );
}
