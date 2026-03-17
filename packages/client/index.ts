export { generateAuthHeaders } from "./src/util/headers";
export { useTRPCClient, useTRPC } from "./src/util/trpc";
export * from "./src/util/decrypt-item";
export * from "./src/util/encrypt-item";

export * from "./src/hooks/app-config";
export * from "./src/hooks/register";
export * from "./src/hooks/login";
export * from "./src/hooks/unlock";
export * from "./src/hooks/update-item";
export * from "./src/hooks/delete-item";
export * from "./src/hooks/get-items";
export * from "./src/hooks/auto-reconnect";

export { default as ClientProvider } from "./src/providers/ClientProvider";
export { default as SessionProvider, SessionContext } from "./src/providers/SessionProvider";
export * from "./src/providers/StoreProvider";
export * from "./src/providers/ItemsProvider";
export { default as ShortcutProvider, useShortcutContext } from "./src/providers/ShortcutProvider";
export type { ShortcutEntry } from "./src/providers/ShortcutProvider";
export { useShortcut } from "./src/hooks/use-shortcut";
