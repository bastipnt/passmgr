---
name: do-parallel
description: Pick 2–4 tasks from the kanbot Backlog, plan their order and split them into conflict-free parts, implement the parts with parallel subagents in isolated git worktrees, merge everything into one integration branch, and run /code-review on each task and on the combined result. Use when the user invokes /do-parallel or asks to work on several kanbot tasks at once.
---

Work several kanbot tasks at once with parallel subagents, then merge and review. Optional args: the number of
tasks (2–4, default 3), specific task titles/ids, and a review level for `/code-review` (default `high`; never
`max`/`ultra` unless the user asked for it).

The rules from `/do` apply to every subagent: **reuse first** (shared logic in `packages/*`, never copied into
web and mobile; reusable components in `packages/ui` / `ui-native` / `ui-shared`), **comments only where the
why is non-obvious**, CLAUDE.md conventions, and the matching `docs/architecture/*.md` file read before changing
a flow and updated after.

## 0. Preconditions (stop if any fails)

- `git status --porcelain` must be empty. Worktrees branch from a commit, so subagents won't see uncommitted
  work. If the tree is dirty, **stop and ask** the user to commit, stash or branch it. Never stash or commit
  for them.
- Note the base: `BASE=$(git rev-parse HEAD)` on `main`. Every branch below starts from `BASE` (or from the
  integration branch for later waves). `main` itself is never changed, and nothing is pushed.

## 1. Pick tasks

1. `list_boards` → `get_board` for this project's board. Move the task(s) in **Review** to **Done** (same as `/do`).
2. Take the top **2–4** Backlog tasks (or the ones named in args) and read each with `get_task`.
3. Leave a task for a later run (skip it, take the next one) when it:
   - is too vague to brief a subagent without asking the user, or
   - would force a fully serial chain with the others and you can't split it (see below).
   Tell the user which tasks you skipped and why.

## 2. Plan: map files, split, order

Do the planning yourself or with **read-only** Explore/Plan agents. They can run in parallel in the main
checkout, without a worktree.

1. **File map:** for each task, list the files/packages it will most likely touch. Grep for the real
   files; don't guess.
2. **Split into parts.** Package and app borders are the natural lines: `schema` / `crypto` / `db` → `client`
   / `store` → `server` → `web` / `mobile`. A task may become 1–3 parts, each owned by one subagent with a
   disjoint file set. Split only when the parts can be built against a contract written down up front
   (function signature, Zod schema, tRPC procedure name and input/output). Otherwise keep it as one part.
3. **Hot files** (only one part per wave may own each):
   - `packages/db` schema + migrations: `db:generate` numbers and snapshots collide. One owner per wave.
   - `packages/store` migrations (version numbers): one owner per wave.
   - `pnpm-lock.yaml` / `package.json` dependency changes: allowed, but the lockfile gets regenerated after
     merging, not hand-merged.
   - Shared hubs such as `packages/client/src/providers/StoreProvider.tsx`, router index files, barrel
     `index.ts`: one owner. Others may only add an export line to a barrel (an easy merge).
   - `docs/architecture/*.md`, nested `CLAUDE.md`: several owners are OK, fix them up during the merge.
4. **Waves:** parts with no dependencies run together in wave 1. A part that needs another part's real code
   (not just its contract) goes in a later wave, branched from the integration branch after the earlier
   wave is merged. Prefer 1–2 waves, and **at most 4 subagents in a wave**.
5. **Merge order:** fundamental first: schema/crypto/db → client/store → server → web/mobile → docs.
6. Show the plan to the user in a short table (task → parts → owner files → wave), then go ahead without
   waiting, unless something is ambiguous enough to need an answer.

Move the chosen tasks to **In Progress**.

## 3. Run the subagents

Start every part of a wave from **one** REPL script with `Promise.all` over `tools.Agent({..., isolation:
"worktree"})` (subagent_type `general-purpose`). Subagents don't see this conversation, so each prompt must be
self-contained and include:

- The kanbot task title + full description, and **which part** of it this agent owns.
- The **contract** with the other parts (exact signatures / schemas / procedure names) and "do not implement
  the other side".
- **Allowed files** (its owned set) and **forbidden files** (the other parts' sets and the hot files it doesn't
  own). If it really needs to change a forbidden file, it should make the smallest change and say so in its
  report, not refactor around it.
- The branch to create in its worktree: `git switch -c par/<task-slug>/<part>`. For wave 2+, first
  `git reset --hard <integration-branch-sha>`, a SHA you pass in.
- Setup: `pnpm install --frozen-lockfile` (plain `pnpm install` if it adds a dependency).
- **Shared runtime resources are off limits:** don't start dev servers, don't run Playwright E2E, don't run
  `db:up` / `db:migrate` / dev DB resets (Postgres and the ports are shared by every worktree). Only Vitest,
  typecheck and lint. Write the E2E test if one is truly needed (CLAUDE.md: keep E2E tests few), but leave
  running it to the orchestrator.
- The `/do` rules quoted above (reuse first, no needless comments, docs updated).
- Done means: `pnpm --filter <touched pkgs> typecheck`, `lint` and `test` pass. Then commit on its branch
  with a Conventional Commit message ending with the session's commit attribution line. **Never push**,
  never touch `main`.
- Report back: branch name, worktree path, commit SHA, files changed, contract deviations, test results,
  open questions.

While they run, don't edit files in the main checkout that they own.

## 4. Merge

Do all merging in a dedicated worktree so the main checkout stays on `main`:

```
git worktree add ../passmgr-integration -b par/integration-<yyyy-mm-dd> $BASE
```

1. **Per task:** create `par/<task-slug>` from `BASE` (its own worktree) and merge that task's part branches
   into it (`--no-ff`). This is the branch the per-task review looks at.
2. **Integration:** merge the task branches into `par/integration-*` in the planned order, one at a time. After
   **each** merge run `pnpm install` and the typecheck/tests of the touched packages, so a break points at one
   branch.
3. **Conflicts:**
   - Mechanical ones (imports, barrel exports, docs, neighbouring lines): resolve them yourself.
   - `pnpm-lock.yaml`: take either side, then `pnpm install` to regenerate it, then commit.
   - Migration number/snapshot clashes: regenerate the later migration on top of the merged schema; never
     hand-edit Drizzle snapshots.
   - Two different design decisions (both sides changed the same logic differently): **stop and ask the
     user**, showing both versions.
   - A large conflict: it is often cheaper to drop one part's branch and re-run that subagent on top of the
     merged integration branch.
4. If there is a wave 2, start it now from the integration branch SHA, then merge it the same way.
5. After everything is merged: root `pnpm typecheck && pnpm lint && pnpm test`. If any task added or changed
   E2E tests, run `pnpm --filter web e2e` **once, here**, serially.

## 5. Review

Use the `code-review` skill (`tools.Skill({skill: "code-review", args: ...})`) at the chosen level, with
`--fix`:

1. **Each task:** check out `par/<task-slug>` in its worktree and review its diff against `BASE`. Also check
   by hand for logic duplicated between web and mobile, reusable components placed in an app, and comments
   that don't earn their place. Commit the fixes on the task branch
   (`fix(review): …` plus the attribution line), then merge the task branch into integration again.
2. **Combined:** review `par/integration-*` against `BASE`. This catches problems no single task shows:
   duplicate helpers added by two tasks, contract drift, inconsistent naming, broken invariants
   (`docs/security/threat-model-inputs.md`, key hierarchy rules). Apply the fixes and commit.
3. Re-run root `pnpm typecheck && pnpm lint && pnpm test`. If it's not green, fix it, or report it plainly
   with the output.

## 6. Hand off

- Leave `par/integration-*` (one merge per task plus review-fix commits) for the user. **Don't merge it into
  `main` and don't push.**
- Remove the part and task worktrees (`git worktree remove`). Keep the integration worktree and all branches
  until the user has merged.
- For each task, move it to **Review** in kanbot and add a comment with: what changed, how it was split
  across subagents, any conflicts and how they were resolved, the review findings and how each was fixed
  (or why it was skipped), and the final test status.
- Tell the user the integration branch name and worktree path, which tasks were done or skipped, and
  anything that still needs their decision.
