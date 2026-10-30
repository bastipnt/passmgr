// passmgr dev session helper: runs INSIDE the web app's page (dev server only).
// Load it without a reload (keys live in memory, a reload locks the vault):
//   const s = await import(`/@fs${REPO}/.claude/skills/passmgr-session/scripts/session.js?t=${Date.now()}`);
//   await s.ensure();            // unlocked vault, whatever state the page was in
//   await s.seed();              // demo records, once per vault
// Every export is also on `window.passmgr`. All values here are dev-only test data.

/** Local test vault: strong enough for the strength check, reused so `ensure` can unlock it. */
export const VAULT_PASSWORD = "Tq7-glass-orbit-91-river";
export const VAULT_NAME = "Claude test";
/** The seeded dev account on the local server (only reachable from the :5173 origin, CORS). */
export const ACCOUNT = { email: "passmgr@example.com", password: "passmgr123" };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Polls `fn` until it returns something truthy. */
export async function waitFor(fn, { timeout = 15000, label = "condition" } = {}) {
  const end = Date.now() + timeout;
  for (;;) {
    const value = fn();
    if (value) return value;
    if (Date.now() > end)
      throw new Error(`passmgr: timed out waiting for ${label} (at ${location.pathname})`);
    await sleep(100);
  }
}

/** Client-side navigation (wouter listens to popstate): never reloads, so the vault stays unlocked. */
export function go(path) {
  history.pushState(null, "", path);
  dispatchEvent(new PopStateEvent("popstate"));
}

const visible = (el) => !!el && el.getClientRects().length > 0 && !el.closest("[inert]");
const $ = (sel, root = document) => [...root.querySelectorAll(sel)].find(visible);
const byText = (text, root = document, sel = "button, a, [role=button]") =>
  [...root.querySelectorAll(sel)].find(
    (el) =>
      visible(el) &&
      (text instanceof RegExp ? text.test(el.textContent.trim()) : el.textContent.trim() === text),
  );

/** Sets a React-controlled input's value the way typing does. */
export function fill(el, value) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
  Object.getOwnPropertyDescriptor(proto.prototype, "value").set.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

const click = (el) => el.click();

/** Where the app is: "app" (unlocked), "unlock", "welcome", "create", "accountLogin", "enroll", "recovery", "loading". */
export function state() {
  if (byText(/save your recovery key/i, document, "h1, h2, h3")) return "recovery";
  if (location.pathname.startsWith("/enroll-biometric")) return "enroll";
  if ($('[aria-label="New item"], [aria-label="New record"]') || byText(/^New (record|item)$/))
    return "app";
  if (location.pathname.startsWith("/create")) return "create";
  if (location.pathname.startsWith("/login/account")) return "accountLogin";
  if (location.pathname.startsWith("/login") && $('input[name="password"]')) return "unlock";
  if (location.pathname.startsWith("/welcome")) return "welcome";
  return "loading";
}

async function settle() {
  await sleep(300);
  return waitFor(() => (state() === "loading" ? undefined : state()), {
    timeout: 20000,
    label: "app to settle",
  });
}

async function finishOnboarding() {
  for (let i = 0; i < 10; i++) {
    const s = await settle();
    if (s === "app") return "app";
    if (s === "recovery") {
      // Copy enables "I saved it". A scripted click is no user gesture, so the real
      // clipboard would refuse; a stub also keeps the test key off the OS clipboard.
      const copy = $('[aria-label="Copy to clipboard"]');
      if (copy && navigator.clipboard) {
        const { writeText } = navigator.clipboard;
        navigator.clipboard.writeText = async () => {};
        click(copy);
        await sleep(200);
        navigator.clipboard.writeText = writeText;
      }
      const saved = await waitFor(
        () => {
          const b = byText(/i saved it/i);
          return b && !b.disabled ? b : undefined;
        },
        { label: '"I saved it" enabled (copy or emergency kit first)' },
      );
      click(saved);
    } else if (s === "enroll") {
      click(await waitFor(() => byText(/^skip$/i), { label: "Skip biometric" }));
    } else return s;
    await sleep(500);
  }
  return state();
}

/** Creates a local test vault (no account) and lands unlocked on the list. */
export async function createVault({ password = VAULT_PASSWORD, name = VAULT_NAME } = {}) {
  go("/create");
  // confirmPassword only exists on /create (the page before may still show its own password field).
  const confirm = await waitFor(() => $('input[name="confirmPassword"]'), { label: "create form" });
  const form = confirm.closest("form");
  const nameInput = $('input[name="name"]', form);
  if (nameInput && name) fill(nameInput, name);
  fill($('input[name="password"]', form), password);
  fill(confirm, password);
  await sleep(200);
  click($('button[type="submit"]', form));
  // With a reachable server the flow asks about sync first ("Step 1 of 2").
  const next = await waitFor(
    () => byText(/not now/i) || (state() === "recovery" ? "recovery" : undefined),
    { timeout: 40000, label: "sync step or recovery key (Argon2 takes a few s)" },
  );
  if (next !== "recovery") click(next);
  return finishOnboarding();
}

/** Unlocks the last used profile on /login. Resolves false when the password is turned down. */
export async function unlock(password = VAULT_PASSWORD) {
  if (!location.pathname.startsWith("/login")) go("/login");
  const pw = await waitFor(() => $('input[name="password"]'), { label: "unlock form" });
  fill(pw, password);
  await sleep(100);
  click($('form button[type="submit"]'));
  const result = await waitFor(
    () =>
      byText(/that didn.t work/i, document, "*:not(:has(*))")
        ? "rejected"
        : state() !== "unlock" && state() !== "loading"
          ? state()
          : undefined,
    { timeout: 40000, label: "unlock result" },
  );
  if (result === "rejected") return false;
  return (await finishOnboarding()) === "app";
}

/** OPAQUE login with the dev account (needs the :5173 origin and the local server on :3000). */
export async function login({ email = ACCOUNT.email, password = ACCOUNT.password } = {}) {
  go("/login/account");
  const emailInput = await waitFor(() => $('input[name="email"]'), { label: "account login form" });
  fill(emailInput, email);
  fill($('input[name="password"]'), password);
  await sleep(100);
  click($('form button[type="submit"]'));
  const result = await waitFor(
    () => {
      const error = $('[role="alert"]');
      if (error && /reach the server|didn.t work/i.test(error.textContent))
        return `error: ${error.textContent.trim()}`;
      return location.pathname.startsWith("/login") ? undefined : "ok";
    },
    { timeout: 40000, label: "account login" },
  );
  if (result !== "ok") throw new Error(`passmgr login: ${result}`);
  return finishOnboarding();
}

/**
 * Gets the page to an unlocked vault from wherever it is: already in → nothing;
 * unlock card → the test vault password (falls back to a new vault when it isn't ours);
 * welcome / anything else → a new local vault. `{ account: true }` logs in to the dev account instead.
 */
export async function ensure({ account = false } = {}) {
  let s = await settle();
  if (s === "app") return "app";
  if (s === "recovery" || s === "enroll") return finishOnboarding();
  if (account) return login();
  if (s === "unlock" && (await unlock())) return "app";
  return createVault();
}

/** Demo records: two Wi-Fi, a dozen logins (some tagged), a card, a note. */
export const DEMO_RECORDS = [
  { type: "wifi", fields: { title: "Home WiFi", ssid: "Park-Home", password: "home-wifi-pass" } },
  {
    type: "wifi",
    fields: { title: "Office WiFi", ssid: "Office-5G", password: "office-wifi-pass" },
  },
  ...[
    "GitHub",
    "Gmail",
    "Amazon",
    "Netflix",
    "Spotify",
    "Dropbox",
    "Slack",
    "Figma",
    "Notion",
    "Linear",
    "Vercel",
    "Stripe",
  ].map((title, i) => ({
    type: "login",
    fields: {
      title,
      username: `me+${title.toLowerCase()}@example.com`,
      password: `pw-${title}-${i}!x`,
    },
    tags: i % 3 === 0 ? ["work"] : i % 3 === 1 ? ["finance"] : [],
  })),
  {
    type: "card",
    fields: { title: "Visa", cardholderName: "Test User", number: "4111111111111111" },
  },
  { type: "note", fields: { title: "Notes", note: "A secure note for testing." } },
];

async function addTag(dialog, tag) {
  const input = $('[role="combobox"][placeholder^="Add"]', dialog);
  if (!input) return;
  // `TagInput` adds the text before a comma (a scripted Enter isn't picked up).
  fill(input, `${tag},`);
  await sleep(150);
}

/** Creates one record through the create sheet; resolves its id. `type`: wifi, login, card, note, identity, ssh, api … */
export async function createRecord({ type, fields, tags = [] }) {
  const base = location.pathname.startsWith("/record") ? "/" : location.pathname;
  go(`${base}?new=&type=${type}`);
  const dialog = await waitFor(
    () =>
      $('[role="dialog"]:not([aria-label="Search"]) input[name="title"]')?.closest(
        '[role="dialog"]',
      ),
    {
      label: `${type} create sheet`,
    },
  );
  for (const [name, value] of Object.entries(fields)) {
    const el = $(`[name="${name}"]`, dialog);
    if (el) fill(el, value);
    else console.warn(`passmgr: no field "${name}" on ${type}`);
  }
  for (const tag of tags) await addTag(dialog, tag);
  await sleep(150);
  click(await waitFor(() => byText(/^Create( [\w -]+)?$/, dialog), { label: "Create button" }));
  const id = await waitFor(() => location.pathname.match(/\/record\/([^/?]+)/)?.[1], {
    label: "new record page",
  });
  go("/");
  await sleep(300);
  return id;
}

/** Seeds `records` (default DEMO_RECORDS) unless the list already holds records (`force` to add anyway). */
export async function seed({ records = DEMO_RECORDS, force = false } = {}) {
  if ((await settle()) !== "app") throw new Error("passmgr seed: unlock first (ensure())");
  const count = Number(
    document.querySelector("h1 span:last-child, h2 span:last-child")?.textContent,
  );
  if (!force && count > 0) return { skipped: true, count };
  const ids = [];
  for (const record of records) ids.push(await createRecord(record));
  return { created: ids.length };
}

window.passmgr = {
  VAULT_PASSWORD,
  VAULT_NAME,
  ACCOUNT,
  waitFor,
  go,
  fill,
  state,
  createVault,
  unlock,
  login,
  ensure,
  createRecord,
  seed,
  DEMO_RECORDS,
};
