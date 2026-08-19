# Changelog

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
