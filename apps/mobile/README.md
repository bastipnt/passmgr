# @repo/mobile

Mobile client for [passmgr](../../README.md). React Native + Expo.

> ⚠️ **Auth flow only.** Vault, records, and biometric unlock are not implemented yet. The home screen explicitly says "Auth flow works" — that's the honest scope today.

## Stack

- **React Native 0.83** + **Expo 55**
- **Tamagui** for component styling (migrated from NativeWind-only — see recent commits)
- **NativeWind** still used in places
- **tRPC** client via `@repo/client` (shared with web)
- Components from `@repo/ui-native`

## Current state

- Registration flow works (OPAQUE)
- Login flow works (OPAQUE)
- Home screen after login is a placeholder

## Not yet implemented

- Vault list / view / add / edit / delete
- Biometric unlock (Face ID / Touch ID / Android Biometric)
- Logout (current TODO: "for v1 user can kill the app")
- Record sync
- Idle lock

## Dev

```bash
pnpm --filter mobile start
```

This launches Expo's dev server. From there:

- Press `i` for iOS simulator
- Press `a` for Android emulator
- Scan the QR with the Expo Go app for a device build (Expo Go's sandbox limitations apply)

For full native-module support you'll need a development build — see [Expo's dev-build docs](https://docs.expo.dev/develop/development-builds/introduction/).

### Pointing at a local server

The mobile app talks to the server in `apps/server`. Make sure:

1. The server is running (`pnpm --filter server dev`)
2. The tRPC base URL is reachable from the device/simulator (localhost works from a simulator; a real device needs your machine's LAN IP)
