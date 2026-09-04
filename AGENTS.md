# Agent Workflow

> Coding-agent roles, quality gates, and repository conventions for Australia Tech Map — anticipated in [PRODUCT_SPEC.md](./PRODUCT_SPEC.md) Appendix B.1. Read this before making any change in this repository.
> Version 1.6 · 4 September 2026

> [!IMPORTANT]
> **Current status (4 September 2026):** Codex is unavailable (quota exhausted, duration unknown). **Claude is the active implementer**; Gemini continues its orchestration and UI/browser duties. This means there is currently **no independent third-party code reviewer** — Claude reviewing its own implementation work is a real gap, not a solved problem, until Codex returns or the user reviews directly. Per the fallback already defined in "Switching implementers" below, **merges go to the user directly**; no agent is currently authorized to merge. Update or remove this note once Codex resumes — the Roles table and Orchestration loop below still describe the default, steady-state assignment, not the current one.

## Roles

| Agent | Default role | Owns |
| :--- | :--- | :--- |
| **Codex** | Active implementer and final integrator | Repository structure, database migrations, ingestion pipelines, APIs, tests, debugging, and final merges. Sole owner of the main branch — performs the final merge even for a branch Claude implemented while activated as backup. |
| **Claude** | Independent reviewer; backup implementer when explicitly activated | Reviews PRs against [PRODUCT_SPEC.md](./PRODUCT_SPEC.md) and [ARCHITECTURE_DECISIONS.md](./ARCHITECTURE_DECISIONS.md); inspects security and data-integrity decisions; maintains `README.md`, `PRODUCT_SPEC.md`, `IMPLEMENTATION_PLAN.md`, `ARCHITECTURE_DECISIONS.md`, and this file. Takes over active-implementer duties on the one live implementation branch only when the user explicitly activates backup mode (see Switching implementers below), and hands back to reviewer duties when deactivated. `HANDOFF.md` is governed separately below because its temporary owner is whichever implementer is outgoing. |
| **Gemini (Antigravity/Flash)** | Rapid prototyping and browser verification, ~10–20% of total usage | UI experiments, map interactions, responsive testing, browser-driven E2E checks, source research, and bounded parallel tasks — on isolated branches, gated until the relevant API contracts exist. |

The point of this split is not picking a "best" model — it's having exactly one active implementer at any moment and exactly one final integrator (Codex, always). Whichever of Codex/Claude is not currently implementing is the independent reviewer of the one who is.

## Orchestration

This runs locally inside Antigravity — a workspace agent, not separate hosted bots. The workspace agent lives at [`.agents/agents/austechmap-orchestrator/agent.md`](.agents/agents/austechmap-orchestrator/agent.md) (Antigravity's own discovery convention: `.agents/agents/{name}/agent.md`, YAML frontmatter + instructions, auto-discovered by `/agents`). Its scratch state for the run in progress lives under `.agents/runs/current/` (`TASK.md`, `CLAUDE_PLAN.md`, `CODEX_RESULT.md`, `TEST_RESULTS.md`, `CLAUDE_REVIEW.md`) — those are working files for one run, not a durable record; `HANDOFF.md` is still the durable record.

Operating loop for one task:

Gemini orchestrates → Claude plans/reviews → Codex implements → Gemini tests/browser-checks → Claude re-reviews → Codex integrates.

This is the primary mechanism for coordinating the team going forward. The manual, user-triggered protocol in "Switching implementers" below remains the fallback — for whenever Antigravity itself is unavailable, and as the underlying mechanism Antigravity invokes to actually carry out a switch.

Orchestration rules (the agent definition enforces these; they're restated here as the source of truth):

- Claude runs read-only with respect to application code during orchestrated runs — planning and review only. This doesn't change Claude's existing docs-authoring exception (Rule 1 below): Claude may still author changes to its owned docs, Codex still commits them.
- Codex is the only application-code writer and the only integrator — unchanged from the rest of this document.
- Agents execute sequentially. Never two agents editing the same worktree concurrently.
- Review findings go directly into the next Codex prompt. The orchestrator does not patch code itself, and does not let Claude patch code directly (Rule 4 still applies inside orchestration).
- Maximum two fix loops before the orchestrator stops and asks the user for a decision, rather than looping indefinitely.
- Destructive commands and merges always require explicit user approval, regardless of any autonomous-execution setting Antigravity itself offers (its `commandExecutionPolicy` gates its own notion of "high-risk," which may not match ours — don't rely on it alone for this).
- Git history remains the permanent audit record: no rewriting commits, no squashing away a review trail.

Both CLIs are invoked non-interactively so Antigravity can capture their output: `claude -p "<prompt>"` for Claude, `codex exec "<prompt>"` for Codex (add `--sandbox read-only` when Codex should only read, not write). Verify either is working with `claude -p "Reply only CLAUDE_OK"` and `codex exec --ephemeral --sandbox read-only "Reply only CODEX_OK"`.

Antigravity's own UI/browser/prototyping duties (see Roles, above) are unaffected — orchestration is an additional function layered on top of that role, not a replacement for it.

## Switching implementers

Neither agent can see its own or the other's remaining quota. Antigravity, as orchestrator, may trigger a switch on the team's behalf (see Orchestration, above); absent Antigravity, a switch is user-triggered — Codex and Claude never decide it themselves.

- Switch when a provider's usage reaches roughly 75–80% of its available quota. Don't track exact token counts in this repository — quotas and task complexity vary too much for a number here to stay true.
- Exactly one active implementation branch at a time. The agent being activated picks up that branch; it does not start a second, competing one.
- Every switch requires a committed checkpoint, test results, a changed-file list, and a next-action note, written to `HANDOFF.md` before the outgoing implementer stops. The incoming implementer reads it before touching anything.
- `HANDOFF.md` is temporarily owned by the outgoing active implementer for the sole purpose of preparing and committing a switch. The incoming implementer may verify it but does not rewrite that handoff; any discovered gap is reported, then corrected by the newly active implementer after the user confirms the switch. Git history preserves every prior handoff at the same path.
- Codex performs the final merge regardless of who implemented. If Codex itself is fully unavailable (not just near-quota, but actually unreachable), the merge falls back to the user directly — this workflow has no third agent authorized to merge.
- A practical starting allocation, advisory rather than enforced:

  | Work | Allocation |
  | :--- | :--- |
  | Active implementation | 60% |
  | Independent review / fix-loop | 25% |
  | Gemini UI/browser work | 15% |

### Git interoperability

The repository may be accessed by different Windows or sandbox accounts. Git can reject an otherwise valid repository when `.git` is owned by a different account. This is expected in the multi-agent workflow and does not imply repository corruption.

- For this repository, agents use the exact-path command override `git -c safe.directory=C:/Users/jeeva/Projects/AusTechMap ...` whenever Git reports dubious ownership. Never disable the protection globally with a wildcard such as `safe.directory=*`.
- The user may optionally trust this one repository persistently by running `git config --global --add safe.directory C:/Users/jeeva/Projects/AusTechMap` outside agent sandboxes. That machine-level choice belongs to the user; agents do not make it automatically.
- No repository or global commit identity is assumed. Agent-authored commits use command-scoped identities: Codex uses `-c user.name=Codex -c user.email=codex@localhost`; Claude uses `-c user.name=Claude -c user.email=claude@localhost`; Gemini uses `-c user.name=Gemini -c user.email=gemini@localhost`.
- A human-authored commit uses the user's own configured identity. Agents never persist or overwrite the user's local/global identity without explicit instruction.

## Tooling

| Tool | Status | Role |
| :--- | :--- | :--- |
| **Serena** (MCP, LSP-based code navigation) | Add during Phase 1 | Exact symbol definitions, references, callers, and safe code navigation. Used by Codex (implementation) and Claude (review — e.g. tracing every caller before approving a signature or schema change). |
| **Graphify** (local, Tree-sitter-based code-knowledge graph) | Trial-gated, not yet added | Cross-file architecture, dependency paths, subsystem relationships, and visualization — closer to Claude's review role than to implementation. |
| **Graphiti** (hosted temporal knowledge graph for agent memory) | Rejected | The markdown docs plus git history already serve as this workflow's shared, cross-session memory. Revisit only against a specific, demonstrated cross-session memory problem those can't solve. |
| **Gemini Antigravity** | In use | The environment for Gemini's UI/browser/prototyping role above, and — as of 4 September 2026 — the team's orchestrator (see Orchestration). |

### Graphify adoption gate

There's no meaningful codebase to graph yet — don't add it now. Reassess at Phase 3, or once the repository crosses roughly 20,000–30,000 lines, whichever comes first:

1. Compare five real review/navigation questions using Serena alone vs. Serena plus Graphify.
2. Keep it only if it materially improves call-path analysis, impact analysis, or review time.
3. Treat its inferred edges as hints, not proof — confirm anything load-bearing through Serena or direct source inspection.
4. Verify the exact package before pinning: the intended one is `graphifyy`; several similarly-named packages exist, so check publisher identity and source repo, not just the name string.
5. Don't commit its generated output directory to git, and don't let a generated graph become a second source of truth alongside the docs above.
6. Require a freshness check or rebuild before using it for any PR review — a stale graph is worse than no graph.

## Rules

1. **Codex owns the main branch.** Gemini and Claude never push directly to it. This has no exception for documentation: Claude authors changes to its owned docs directly in the working tree, but Codex still reviews and commits them, the same as any other change.
2. **Gemini works on isolated frontend/prototype branches**, started only after the API contracts those prototypes depend on already exist.
3. **The independent reviewer reviews completed diffs without simultaneously editing them.** When Claude is reviewing, its edit lane is limited to the docs above — never application code, never while the active implementer has a branch in flight. When Codex is reviewing instead (Claude activated as backup implementer), the same separation applies in reverse.
4. **The fix-loop runs through the active implementer, not the reviewer.** If a review finds an issue, the active implementer applies the fix — never the reviewer, regardless of which agent is in which seat. A reviewer who fixes things quietly becomes a second editor, which defeats the point of rule 5.
5. **Only one agent edits migrations, shared contracts, or architecture files at a time.** This is the load-bearing rule; everything else is negotiable, this one isn't.
6. **Every change passes automated tests and one independent AI review** before merging.
7. **Implementation-time deviations from `ARCHITECTURE_DECISIONS.md` get written back into it**, not left as undocumented differences between what the docs say and what the code does. The active implementer notes the deviation (PR description is fine); the independent reviewer folds it into the ADR, whichever agent that is at the time. The docs are the only state genuinely shared across all three tools — none of them see each other's conversation history — so they have to stay current, not just accurate at the last phase gate.
8. **Commit at every phase gate**, per [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) §12 (Governance and reporting).

## Bootstrapping

These repository rules apply immediately, including during Phase 0 and Phase 1 bootstrapping. Codex initializes the local git repository and establishes the first committed checkpoint. Branch, pull-request, and remote-merge rules become enforceable once the repository is pushed to a remote that all three tools can access. Pushing to or creating that remote requires the user to select and authorize the destination.

The switching and handoff rules remain active throughout bootstrapping. A quota-driven or deliberate dry-run switch may therefore occur during Phase 1; it must use the same committed-checkpoint procedure as any later switch.

## Phase 1 assignments

These are the default assignments — subject to the switching protocol above if Codex's quota runs low mid-phase.

- **Codex**: monorepo structure, PostgreSQL/PostGIS on Neon, migrations, the Python worker skeleton, CI.
- **Gemini**: map/UI prototype and browser test scenarios, started once Phase 1's API contracts exist.
- **Claude**: review the Phase 0 ADRs and the Phase 1 milestone output against [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)'s exit gate.
