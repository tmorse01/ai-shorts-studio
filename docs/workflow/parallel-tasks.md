# Parallel task workflow

How we pick up rebuild tasks, implement them in parallel, and get each one reviewed. The
orchestrating session picks tasks and starts **one new session per task**. Each task session works in
its own git worktree and ends with a PR against `rebuild`. ("Sub-agent" below means that task
session.)

## How a task session is started (token budget)

The project runs on a $20/month plan, so the orchestrator stays lean and task sessions start small.

- **A new session, not a background agent.** The orchestrator uses `start_session` with
  `context: "fresh"`, `model: "claude-haiku-5-5"`, `use_worktree: true` and
  `source_branch: "rebuild"`. Don't use in-process background agents: their full transcripts and
  reports flow back into the orchestrator's (Opus) context. A separate session keeps its own context,
  and the orchestrator only sees a short note when it finishes.
- **Minimal brief.** The brief is only: the issue number and title, the mode, and "follow
  `docs/workflow/parallel-tasks.md`". Add task-specific gotchas only if a previous task hit them.
  Don't restate the issue: the session reads it from GitHub.
- **One task per session.** When the PR is open and CI is done, the session reports and stops. It
  never picks up a second task. The orchestrator starts a new session for the next one. The owner
  archives finished sessions.
- **Short report, key facts first.** The orchestrator only sees the first ~400 characters, so the
  report's first line must be: `PR #<n> · CI <green|red> · criteria <ticked>/<total> · <blocked on #X | needs decision: … | ok>`.
  Details can follow.
- **Spend tokens on code, not checking.** Lint, typecheck, test, build and CI are the gate. No
  browser or screenshot verification unless the issue asks for it (at most one screenshot for a UI
  task). Read only what the task needs: the issue, the parts of `CLAUDE.md` that apply, and only the
  relevant sections of `docs/rebuild/DESIGN.md` for UI tasks. Wait for CI with one blocking
  `gh pr checks <n> --watch`, not repeated polling. Write PR bodies to a file and use
  `--body-file`; never pipe from an empty stdin.
- **Rough budget:** ~80–120k tokens for a typical task, ~150k as a soft ceiling. A session about to
  go well past that should stop and report what's left rather than keep going.

Three modes decide who reviews and merges the PR:

- **Mode A: human review.** The sub-agent opens the PR and stops. A human reviews and merges.
- **Mode B: self-review and merge.** The sub-agent reviews its own diff, fixes what it finds, and
  merges once CI is green. No human step.
- **Mode C: checks pass, orchestrator merges.** The sub-agent opens the PR and stops, as in mode A.
  The orchestrator does **not** run a separate review. It checks that CI is green on the latest
  commit and reads the sub-agent's report (which criteria are ticked, and what's unverified). If CI
  is green, it merges the PR (`--merge`, no `--admin`), closes the issue, moves it to Done on the
  board, and starts the next unblocked task. Any unticked criteria that belong to a later task are
  added to that task's issue so nothing is lost.

**Mode C is the default** (the owner approved it on 2026-10-24, with no reviewer agent, to save
tokens). The orchestrator still stops and asks the human, without merging, when CI is red after the
sub-agent's three attempts, or when the sub-agent's report flags a product or design decision the
issue doesn't settle. Mode A is for tasks the owner asks to see.

## Roles

- **Orchestrator:** the session that picks tasks, checks dependencies, starts sub-agents, watches
  their PRs and CI, and reports back. It does not write feature code itself.
- **Sub-agent:** one per task. It implements exactly one GitHub issue, opens one PR, and then
  follows the mode's end steps.
- **Reviewer:** a human in mode A, and the sub-agent itself in mode B. In mode C, CI is the gate
  and the orchestrator merges.

## Picking tasks

1. Only pick tasks whose **Depends on** issues are all closed or merged into `rebuild`.
2. Run at most **three** sub-agents at a time.
3. Prefer tasks that touch different areas. Expect shared-file conflicts in `package.json`,
   `pnpm-lock.yaml`, `src/renderer/App.tsx`, `src/main/index.ts` and `tests/`. Two tasks that both
   need to rewrite the same file should run one after the other.
4. **Skip blocked tasks and take the next unblocked one.** Walk the backlog in order (epic number,
   then task number, e.g. 01.07 → 01.10 → 02.01 → 02.02 …). A task is blocked if any issue in its
   **Depends on** is still open and unmerged, including one another sub-agent is working on right
   now, or if its description says it uses work from an epic that isn't merged yet. Don't wait on a
   blocked task, and don't branch from another sub-agent's unmerged branch. Move on down the list
   until you find a task whose dependencies are all merged into `rebuild`, even if it's in a later
   epic. The same rule applies when a slot frees up after a merge: re-walk the list from the top,
   because the merge may have unblocked an earlier task.
5. If fewer than three tasks are unblocked anywhere in the backlog, start the ones that are. Do not
   start a task early just to fill a slot. If none are unblocked, report which open PRs are holding
   things up and stop.
6. Choose the mode per task:
   - **Mode C** by default, including tasks that change a shared contract the issue asks for.
   - **Mode A** only when the owner asks to review a task themselves.
   - **Mode B** for small, self-contained work inside one feature folder, such as a test-only task,
     where the acceptance criteria can be checked from the diff and CI.
   In every mode, the sub-agent's own steps stop after opening the PR, except in mode B. Mode C's
   review and merge are the orchestrator's job.

## Sub-agent steps

Each sub-agent does these steps, in order, and does not skip any. Steps 1 to 7 are the same in both
modes. Steps 8 and 9 differ.

1. **Read the task.** `gh issue view <N> -R tmorse01/ai-shorts-studio` and its parent epic.
   Read `CLAUDE.md` and the design source it points to (`docs/rebuild/DESIGN.md`) if the task has
   any UI. Then check that every **Depends on** issue is merged into `origin/rebuild`. If one isn't,
   including one another sub-agent is still working on, don't start and don't stub the missing
   piece. Report "blocked on #X" and the orchestrator gives you the next unblocked task under
   *Picking tasks* rule 4. The same applies if you find a hidden dependency partway through: stop,
   push nothing, and report.
2. **Branch from `rebuild`.** Fetch, then create a branch named `claude/<NNNN>-<slug>-haiku-<hash>`
   from `origin/rebuild`. Work only in its own worktree.
3. **Implement only the issue.** Anything else it notices becomes a follow-up note in the PR
   description, not a code change. Do not edit `docs/rebuild/` or `site/`.
4. **Verify locally.** `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` must all pass.
   Fix failures, don't skip them.
5. **Commit.** One commit per logical change. The message ends with
   `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`.
6. **Push and open a PR against `rebuild`.** The PR body starts with `Part of #1. Closes #<N>.`,
   lists what changed and the decisions made, and ends with
   `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
7. **Wait for CI.** Watch the run until it finishes. If it fails, fix it on the same branch and
   push again. Stop after three failed attempts and report the failure.
8. **Mode-specific end (see below).**
9. **Report back and stop.** The first line is the summary line from *How a task session is
   started*. After it, briefly: decisions made, and anything not done or not verified (especially
   unticked criteria that a later task should carry). Then end the session's work. Don't start
   another task.

### Mode A: human review

8. **Tick the issue's acceptance criteria** only for criteria it has verified.
9. **Stop.** Report back and do not merge. The human reviews the PR and merges it.

### Mode B: self-review and merge

8. **Review the diff yourself.** Run `/code-review` on the PR at `high` effort, against the issue's
   acceptance criteria and CLAUDE.md. Fix every verified correctness finding, then rerun steps 4 and
   5 and push. Record the review summary (findings found, fixed, and any left open with a reason) in
   a PR comment.
   - Stop and report, without merging, if a finding needs a decision the issue does not settle, or
     if fixing it would change a shared contract listed under mode A.
9. **Tick the issue's acceptance criteria** only for criteria the diff and CI verify. Then confirm
   CI is green on the latest commit, and merge with `gh pr merge <PR#> -R tmorse01/ai-shorts-studio --merge`.
   Do not use `--admin` or skip checks. Do not delete the branch.
10. **Report back** with the merged PR link and the review summary.

## After each merge

- The orchestrator checks which waiting tasks are now unblocked and starts the next sub-agent, up
  to three at a time.
- If a PR conflicts with `rebuild` after another merge, the sub-agent merges `origin/rebuild` into
  its branch, reruns the checks, and pushes. In mode B it then repeats step 8 for the new commit.

## Conventions every sub-agent follows

- Model: task sessions run on `claude-haiku-5-5`, one fresh session per task (see *How a task session is started*).
- Branch names: `claude/<NNNN>-<slug>-haiku-<hash>`, with a PR against `rebuild`.
- Never push to `rebuild` or `main`. Merge only in mode B, and only the sub-agent's own PR.
- Never edit files outside the task's scope to make CI pass. If CI fails for a reason outside the
  scope, report it rather than working around it.
- Keep PRs small: one task, one PR.
