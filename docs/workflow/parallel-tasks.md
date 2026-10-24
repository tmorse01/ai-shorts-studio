# Parallel task workflow

How we pick up rebuild tasks, implement them in parallel, and get each one reviewed. The
orchestrating session picks tasks and spawns one sub-agent per task. Each sub-agent works in its own
git worktree and ends with a PR against `rebuild`.

Two modes decide who merges the PR:

- **Mode A: human review.** The sub-agent opens the PR and stops. A human reviews and merges.
- **Mode B: self-review and merge.** The sub-agent reviews its own diff, fixes what it finds, and
  merges once CI is green. No human step.

The orchestrator names the mode in each sub-agent's brief. Mode A is the default.

## Roles

- **Orchestrator:** the session that picks tasks, checks dependencies, starts sub-agents, watches
  their PRs and CI, and reports back. It does not write feature code itself.
- **Sub-agent:** one per task. It implements exactly one GitHub issue, opens one PR, and then
  follows the mode's end steps.
- **Reviewer:** a human in mode A. In mode B the sub-agent is the reviewer.

## Picking tasks

1. Only pick tasks whose **Depends on** issues are all closed or merged into `rebuild`.
2. Run at most **three** sub-agents at a time.
3. Prefer tasks that touch different areas. Expect shared-file conflicts in `package.json`,
   `pnpm-lock.yaml`, `src/renderer/App.tsx`, `src/main/index.ts` and `tests/`. Two tasks that both
   need to rewrite the same file should run one after the other.
4. If fewer than three tasks are unblocked, start the ones that are. Do not start a task early
   just to fill a slot.
5. Choose the mode per task:
   - **Mode A** for anything that changes a shared contract: the IPC channel set, the store or undo
     engine, the dependency list, routing, or the design tokens.
   - **Mode B** for self-contained work inside one feature folder, such as a component set or a
     test-only task, where the acceptance criteria can be checked from the diff and CI.

## Sub-agent steps

Each sub-agent does these steps, in order, and does not skip any. Steps 1 to 7 are the same in both
modes. Steps 8 and 9 differ.

1. **Read the task.** `gh issue view <N> -R tmorse01/ai-shorts-studio` and its parent epic.
   Read `CLAUDE.md` and the design source it points to (`docs/rebuild/DESIGN.md`) if the task has
   any UI.
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
9. **Report back.** The PR link, CI result, the review outcome, the decisions made, and anything not
   done or not verified.

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

- Model: sub-agents run on `claude-haiku-5-5`.
- Branch names: `claude/<NNNN>-<slug>-haiku-<hash>`, with a PR against `rebuild`.
- Never push to `rebuild` or `main`. Merge only in mode B, and only the sub-agent's own PR.
- Never edit files outside the task's scope to make CI pass. If CI fails for a reason outside the
  scope, report it rather than working around it.
- Keep PRs small: one task, one PR.
