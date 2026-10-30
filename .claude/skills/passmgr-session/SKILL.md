---
name: passmgr-session
description: Get the passmgr web app to an unlocked vault with test records in one call, instead of clicking through create / login / unlock by hand. Use before any browser check of the web app (built-in browser pane or Playwright / playwright-cli), and after anything that reloaded the page (a reload locks the vault). Also has the iOS simulator recipe for real-Safari checks.
---

# passmgr test session

Web keys live in memory: **any reload or `navigate` locks the vault**. `scripts/session.js` runs inside the
page and gets it unlocked from whatever state it's in, without reloading, then seeds demo records.

## 1. Pick the dev server

```bash
curl -s -m 4 -o /dev/null -w "%{http_code}\n" http://localhost:5173/
```

(Run it unsandboxed; the sandbox reports `000` even for a live server.)

- **200**: the user's dev server. Check `lsof -p $(lsof -nP -iTCP:5173 -sTCP:LISTEN -t) | grep cwd` is this checkout. Open it with `preview_start` `{url: "http://localhost:5173"}`.
- **000 / hangs**: start your own with `preview_start` `{name: "web"}`. It lands on **:5174**. The local API server on :3000 only allows the :5173 origin (CORS), so on :5174 you get **local vaults only**, no account login. CORS errors in the console there are expected.

## 2. Unlock + seed (built-in browser)

One `javascript_tool` call. Vite serves repo files under `/@fs/`. The `?t=` busts the module cache after edits:

```js
const s = await import(`/@fs/<repo-root>/.claude/skills/passmgr-session/scripts/session.js?t=${Date.now()}`);
await s.ensure();   // "app": unlocked. Unlock card → test password; not ours / welcome → new local vault
await s.seed();     // 16 demo records once per vault (2 Wi-Fi, 12 logins tagged work/finance, card, note)
```

Afterwards `window.passmgr` has every helper, so later calls don't need the import:

| call | does |
| --- | --- |
| `ensure({ account: true })` | logs in to the seeded dev account instead (:5173 only) |
| `createVault({ password, name })` | a new local vault (sync step answered "Not now"), lands on the list |
| `unlock(password)` | the unlock card; `false` if turned down |
| `login({ email, password })` | account login (OPAQUE); throws on "can't reach the server" |
| `createRecord({ type, fields, tags })` | one record through the create sheet, returns its id. `type`: `login`, `wifi`, `card`, `note`, … `fields` by input `name` (`title`, `username`, `ssid`, `number`, …) |
| `seed({ records, force })` | `records` default `DEMO_RECORDS`; skips a non-empty list unless `force` |
| `go(path)` | client-side navigation (never `navigate` / `location`: they reload and lock) |
| `state()` | `app` / `unlock` / `welcome` / `create` / `accountLogin` / `enroll` / `recovery` / `loading` |

Test values (`VAULT_PASSWORD`, `ACCOUNT`) are constants at the top of the script. Don't repeat them in chat.

Gotchas:
- **Editing `session.js` while a page has it imported makes Vite full-reload that page** (vault locked). Call `ensure()` again.
- Phone layout: `resize_window` `{preset: "mobile"}` first. The pane clears it when its width changes, so set it again before screenshots.
- The recovery-key step stubs `navigator.clipboard.writeText` for its Copy click (a scripted click is no user gesture). The OS clipboard is left alone.

## 3. Playwright (`playwright-cli`, own browser, fresh storage)

```bash
playwright-cli open http://localhost:5174
playwright-cli resize 393 852
playwright-cli run-code "async page => page.evaluate(async () => {
  const s = await import('/@fs/<repo-root>/.claude/skills/passmgr-session/scripts/session.js');
  return { state: await s.ensure(), seeded: await s.seed() };
})"
```

Run `playwright-cli` unsandboxed. It writes `.playwright-cli/` (gitignored). `playwright-cli close` when done. The
Playwright MCP's `browser_run_code_unsafe` takes the same `page.evaluate`.

## 4. iOS simulator (real Safari: keyboard, `vh` vs `dvh`, touch scrolling)

No JS injection there, so set it up by taps. iPhone 17 Pro, points 402×874; screenshots are about 2.29× points:

1. `xcrun simctl boot <udid>`, then `xcrun simctl openurl <udid> http://localhost:5174/create`. If Safari says "network connection was lost", tap reload (288, 816).
2. Tap **Generate** (340, 373), then **Use** (350, 151). This fills both password fields and avoids iOS's own strong-password sheet that typing triggers.
3. **Create vault** (200, 613), wait ~6s. **Copy** (201, 589), **I saved it** (201, 487). On iOS's "Save Password?" tap **Not Now** (127, 416), then **Skip** biometric (105, 525).
4. Records: the create sheet by taps (+ is at about (358, 732)), or test with the empty list.

The vault stays unlocked until a reload. To measure layout in real Safari, render a temporary `fixed` `<pre>` showing
`innerHeight`, `documentElement.scrollHeight`, `visualViewport` and the elements whose bottom passes the viewport
(how the `#root` `min-h-screen` scroll bug was found). Remove it afterwards. `xcrun simctl shutdown <udid>` when done.
