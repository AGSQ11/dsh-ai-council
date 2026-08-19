# Changelog

## 0.3.0

- Added a live animated Council card directly in the conversation for both native `ai_council` tool calls and background `/council` commands.
- Linked host deliberations to DSH tool call ids and command council ids so the chat renderer follows the exact run instead of showing generic activity.
- Added per-member live completion telemetry during each round, including position, confidence, model route, blockers and failover visibility.
- Replaces the live card with the canonical final Markdown decision when deliberation completes; detailed rounds and events remain available behind a collapsed operator trace.
- The same canonical Markdown decision is injected into the main AI context for successful manual councils, keeping the human-visible and model-visible result aligned.
- Upgraded final Council reports to structured Markdown headings and a GFM council-position table.


## 0.2.0

- Added an operator-facing Control Room with live subsystem health, model pool, role registry, planner/router/chair/consensus pipeline, active deliberations, role-to-model staffing, round progress, blockers and event timelines.
- Added live runtime telemetry to the host API without exposing local filesystem paths.
- Added human-readable Council activity events and explicit phase tracking.
- Added an always-visible conversation header status chip for Council readiness / active deliberations.
- Reorganized UI into Control Room, Live, Roles, Templates, Decisions and Configuration.
- Explicitly surfaces optional or limited subsystems instead of implying capabilities that are not enabled.

## 0.1.0 - 2026-08-19

- Initial role-driven AI Council implementation for DeepSeek Harness.
- 20 editable built-in corporate roles, each with an independent role-specific system prompt.
- 8 editable council templates with automatic template/role selection.
- Independent first round, bounded rebuttal rounds, anti-conformity protocol, Chair synthesis, deterministic consensus gate, preserved dissent and adjudication/defer outcome.
- Dynamic model assignment across DSH providers with provider/model diversity, optional role pinning, Model Probe Dead-route avoidance, and per-role model failover.
- Native `ai_council` tool plus `/council`, `/council-result`, and `/council-history` commands.
- Background manual council runs to avoid long-lived command RPC failures.
- Persistent role/template/history state and a public `ctx.aiCouncil` Cordis service.
- Native DSH Settings UI with role/template CRUD and Markdown-rendered council output.
