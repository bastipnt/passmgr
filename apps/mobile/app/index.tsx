import { useContext } from "react";
import { Redirect } from "expo-router";
import { SessionContext } from "@repo/client";

export default function Index() {
  const { loggedIn } = useContext(SessionContext);
  return <Redirect href={loggedIn ? "/(app)" : "/(auth)/login"} />;
}
