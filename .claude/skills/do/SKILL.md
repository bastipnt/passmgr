---
name: do
description: Close the kanbot task in Review as done, then pick up and implement the next task at the top of the Backlog. Use when the user invokes /do.
---

Look at kanbot. The task in Review is done; do the next task at the top of the Backlog.

1. `list_boards` → `get_board` for this project's board.
2. Move the task(s) in **Review** to **Done**.
3. Take the **top** task in **Backlog**, move it to **In Progress**, read it with `get_task`.
4. Implement it per CLAUDE.md conventions; run the relevant typecheck/lint/tests.
   **Reuse first, duplicate as little as possible.** Before writing anything, search for existing
   code that already does it (or nearly does) and use or extend that instead.
   - Logic shared by web and mobile (hooks, state, validation, crypto, sync, formatting, error
     mapping) belongs in a shared package (`packages/client`, `store`, `schema`, `crypto`, `util`),
     never copied into both apps. If you find duplicated logic in the apps while working, lift it
     into the shared package.
   - Components stay platform-specific (web vs. native), but keep them thin: they render, the
     shared logic lives in the packages.
   - New reusable components go in the UI packages: `packages/ui` (web), `packages/ui-native`
     (mobile), `packages/ui-shared` (tokens / platform-neutral bits); not in `apps/web` or
     `apps/mobile`. Only screen- or feature-specific components live in the apps.

   **Comments only where really necessary.** Default to none. Add one only when the *why* is
   non-obvious: a hidden constraint, a security invariant, a workaround for a specific bug, behavior
   that would surprise a reader. Never comment what the code already says (restating the function
   or variable name, narrating steps, "added for X" / task references). Good names over comments.
5. Run the `/code-review` skill on the changes (no PR).
   Also check the diff yourself for duplicated logic between web and mobile, and for reusable
   components placed in an app instead of a UI package, and remove comments that don't earn
   their place.
   Apply every finding's fix automatically, without asking, then re-run the relevant
   typecheck/lint/tests. Then commit on the current branch (`claude`) with a Conventional Commits
   message and push it (`git push -u origin claude`).
6. Move the task to **Review** and add a short comment summarizing what changed, including the
   review findings and how each was fixed (or why it was skipped).
