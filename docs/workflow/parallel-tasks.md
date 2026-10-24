# Parallel task workflow

How we pick up rebuild tasks, implement them in parallel, and get each one reviewed. The
orchestrating session picks tasks and spawns one sub-agent per task. Each sub-agent works in its own
git worktree and ends with a PR against `rebuild` for review.

## Roles

- **Orchestrator:** the session that picks tasks, checks dependencies, starts sub-agents, watches
  their PRs and CI, and reports back. It does not write feature code itself.
- **Sub-agent:** one per task. It implements exactly one GitHub issue, opens one PR, and stops.
- **Reviewer:** a human. Sub-agents never merge their own PRs.

## Picking tasks

1. Only pick tasks whose **Depends on** issues are all closed or merged into `rebuild`.
2. Run at most **three** sub-agents at a time.
3. Prefer tasks that touch different areas. Expect shared-file conflicts in `package.json`,
   `pnpm-lock.yaml`, `src/renderer/App.tsx`, `src/main/index.ts` and `tests/`. Two tasks that both
   need to rewrite the same file should run one after the other.
4. If fewer than three tasks are unblocked, start the ones that are. Do not start a task early
   just to fill a slot.

## Sub-agent steps

Each sub-agent does these steps, in order, and does not skip any.

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
8. **Tick the issue's acceptance criteria** only for criteria it has verified.
9. **Report back.** The PR link, CI result, the decisions made, and anything not done or not
   verified. Then stop. Do not merge.

## Reviewing

- The reviewer reads the PR, the decisions list, and the CI result, then merges with a merge commit
  (`gh pr merge --merge`) once satisfied.
- After each merge, the orchestrator checks which waiting tasks are now unblocked and starts the
  next sub-agent.
- If a PR conflicts with `rebuild` after another merge, the sub-agent rebases or merges
  `origin/rebuild` into its branch, reruns the checks, and pushes.

## Conventions every sub-agent follows

- Model: sub-agents run on `claude-haiku-5-5`.
- Branch names: `claude/<NNNN>-<slug>-haiku-<hash>`, with a PR against `rebuild`.
- Never push to `rebuild` or `main`. Never merge.
- Never edit files outside the task's scope to make CI pass. If CI fails for a reason outside the
  scope, report it rather than working around it.
- Keep PRs small: one task, one PR.
