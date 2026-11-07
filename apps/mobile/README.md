# @repo/mobile

Mobile client for [passmgr](../../README.md). React Native + Expo (iOS / Android).

## Stack

- **React Native** + **Expo** (Expo Router)
- **Uniwind** (Tailwind v4 for React Native) with components from `@repo/ui-native`
- **tRPC** client via `@repo/client` (shared with web)
- On-device encrypted SQLite (expo-sqlite) via `@repo/store`; native Argon2
- Native modules: autofill (iOS credential provider, Android `AutofillService`) and a share extension

## Current features

- Local vaults without an account, or an account via OPAQUE login
- Several vaults, many record types, tags, favorites, search, version history, TOTP, password generator
- Biometric quick unlock, persistent session in Keychain / Keystore, idle lock
- Recovery key flow, two-factor
- Sync and shared vaults
- Password autofill, with "Create login" from the autofill list

## Known gaps

- Hardening such as blocking screenshots on sensitive screens and sensitive-clipboard flags

Styling, fonts and the autofill / share extension design are in [CLAUDE.md](./CLAUDE.md).

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
