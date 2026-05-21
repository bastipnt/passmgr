export { generateAuthHeaders } from "./src/util/headers";
export { useTRPCClient, useTRPC } from "./src/util/trpc";
export * from "./src/util/decrypt-record";
export * from "./src/util/encrypt-record";

export * from "./src/hooks/use-app-config";
export * from "./src/hooks/use-register";
export * from "./src/hooks/use-login";
export * from "./src/hooks/use-unlock";
export * from "./src/hooks/use-unlock-simple";
export * from "./src/hooks/use-create-record";
export * from "./src/hooks/use-update-record";
export * from "./src/hooks/use-delete-record";
export * from "./src/hooks/use-records";
export * from "./src/hooks/use-auto-reconnect";

export { default as ClientProvider } from "./src/providers/ClientProvider";
export { default as SessionProvider, SessionContext } from "./src/providers/SessionProvider";
export * from "./src/providers/StoreProvider";
export * from "./src/providers/RecordsProvider";
export { default as ShortcutProvider, useShortcutContext } from "./src/providers/ShortcutProvider";
export type { ShortcutEntry } from "./src/providers/ShortcutProvider";
export { useShortcut } from "./src/hooks/use-shortcut";
