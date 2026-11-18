---
name: do-n
description: Do the top n kanbot Backlog tasks one after the other on main, each the /do way (implement, review, fix), each finished with its own short, descriptive commit, then summarize what was done. Use when the user invokes /do-n or asks to work through several kanbot tasks in a row.
---

Work through the top **n** Backlog tasks **one after the other**, on `main`, one commit per task.
Args: `n` (default 3), optionally specific task titles/ids instead of "top of the Backlog".

Each task is done exactly as `/do` describes it: read `.claude/skills/do/SKILL.md` at the start and follow
its steps 3–6 for every task (implementation rules: reuse first, shared logic in `packages/*`, reusable
components in the UI packages, comments only where the why is non-obvious; then the code review with every
fix applied). Also read the matching `docs/architecture/*.md` before changing a flow and update it after.
Only the differences below override `/do`.

## 0. Preconditions (stop if one fails)

- On `main`: `git branch --show-current` is `main`.
- Clean tree: `git status --porcelain` is empty. Each commit must contain only its task's changes, so
  uncommitted work from before would leak into the first commit. If the tree is dirty, **stop and ask** the
  user to commit, stash or discard it. Never stash, commit or discard it for them.

## 1. Start

1. `list_boards` → `get_board` for this project's board.
2. Move the task(s) already in **Review** to **Done** (once, here, as `/do` step 2). Tasks finished during
   this run stay in **Review** for the user; never move them to Done in a later iteration.
3. Note the start: `START=$(git rev-parse HEAD)`.

## 2. Loop: for each of the n tasks

1. Re-read the board and take the **top** Backlog task. Move it to **In Progress**, read it with `get_task`.
   - If it is too vague to implement without asking the user, leave it in the Backlog with a comment saying
     what is unclear, and take the next one instead (it still counts toward n only once done).
2. Implement, check and review it as `/do` steps 4–5 say: relevant typecheck/lint/tests, then the
   `code-review` skill on the uncommitted changes with every fix applied, then the checks again.
3. **Commit instead of leaving the changes uncommitted** (this overrides `/do` step 5):
   - `git status` first: stage only what belongs to this task (no stray logs, screenshots, scratch files).
   - One commit per task, Conventional Commits, enforced by commitlint: `type(scope): subject`, subject in
     the imperative, lower case, no trailing period, at most ~72 characters, saying **what changed for the
     user or the code**, not the task title or "implement task X". Add a body of 1–3 short lines only when
     the subject can't carry an important detail (a migration, a changed API, a security-relevant choice).
     End with the session's commit attribution line.
   - Good: `feat(web): filter the record list by tag from the search panel`,
     `fix(store): keep favorites when a vault is re-synced`. Bad: `feat: do backlog task`, `fix: changes`.
   - Let the hooks run; never `--no-verify`. If a hook fails, fix the cause and commit again (a new commit
     attempt, not `--amend` of the previous task's commit).
   - **Never push.** Don't sign (`-S`) either: there is no key in the VM; the user re-signs at the end.
4. Move the task to **Review** with the `/do` step 6 comment, plus the commit SHA and subject.
5. Note for the final summary: task, SHA, subject, the most important changes, notable review findings,
   anything left open.

**If a task can't be finished green** (tests or typecheck still failing after a real attempt, or it needs a
decision from the user): don't commit it and **stop the loop**. Leave its changes uncommitted, keep it in
**In Progress** with a comment on where it stands, and report it. Don't start the next task on top of a
dirty tree.

## 3. End

1. If at least one task was committed, run root `pnpm typecheck && pnpm lint && pnpm test` once. If it
   fails, fix it in a separate `fix(...)` commit, or report it plainly with the output.
2. If any task added or changed an E2E test, run `pnpm --filter web e2e` once here.
3. Give the user the summary:
   - A table: task → commit SHA → commit subject → status (done / skipped / stopped).
   - **Most important changes**: a few bullets across all tasks, ordered by importance (new behavior,
     changed APIs or schemas, migrations, security-relevant changes, new shared packages or components).
   - Notable review findings and how they were fixed.
   - Final check status (typecheck / lint / test / e2e), skipped or stopped tasks and why, and anything
     waiting for the user's decision.
   - `git log --oneline $START..HEAD` for reference. Remind the user nothing was pushed.
   - **Re-sign before pushing.** The VM has no GPG key, so the commits are unsigned. Give the user the
     command with the real SHA filled in, to run on their host (where their key and pinentry work):
     ```bash
     git rebase --exec 'git commit --amend --no-edit -S' <START-sha>
     ```
     Note that it rewrites the commit SHAs (fine, nothing is pushed yet) and that
     `git log --format='%h %G? %s' <START-sha>..HEAD` should then show `G` for every commit.
