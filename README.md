# dsh-ai-council

A role-driven enterprise AI deliberation plugin for [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness).

Instead of asking several models the same question, AI Council creates a temporary corporate decision board. Every seat has its own editable system prompt and professional mandate. Models are dynamically assigned to those roles, draft independently before seeing peer opinions, rebut unresolved objections in bounded rounds, and stop only at an evidence-backed consensus or an explicit Chair adjudication/defer outcome.

## Core design

**Role first, model second.** `Principal Software Architect`, `Security Architect`, `Commercial Director`, `UI/UX Lead`, and the other seats are persistent role definitions. The model occupying a seat can change from council to council or mid-run when its route fails.

**Independent first round.** Members do not see peer opinions in Round 1. This reduces anchoring and premature convergence.

**Bounded deliberation.** Later rounds expose the previous structured positions and the Chair's unresolved focus. Members must answer peer objections but are explicitly instructed not to agree merely to manufacture consensus.

**Consensus is not majority.** The host checks the Chair's consensus claim against the configured weighted approval threshold and authoritative role blockers. A Security/Data/Release role can keep consensus blocked when it still reports a domain-critical issue.

**Failure replaces the model, not the role.** A failed model route is retried through the role's remaining candidates. The replacement receives the same role system prompt and current council state.

## Built-in corporate roles

Twenty presets ship in 0.1.0:

- Chair / Technical Director
- CTO / Technology Strategy
- Principal Software Architect
- Staff Implementation Engineer
- Tech Stack Specialist
- Security Architect / CISO
- SRE / DevOps Lead
- Performance Engineer
- Database / Data Architect
- QA / Test Architect
- UI/UX Lead
- Product Manager
- Commercial / Business Director
- Finance / Cost Controller
- Customer Support Lead
- Compliance / Privacy Officer
- API / Integration Architect
- Release Engineering Lead
- Adversarial Reviewer / Red Team
- Future Maintainer

Every preset is editable, disableable and deletable. Built-ins can be restored later without deleting custom roles. Custom roles can be created from the Settings UI and may pin a specific provider/model or remain dynamically routed.

Each role stores:

- name and description
- `member` or `chair` type
- a complete role-specific system prompt
- expertise tags
- council weight
- blocking authority
- veto categories
- model-routing hints
- optional provider/model pin

The shared anti-conformity Council Protocol is prepended automatically; role prompts only need to define the professional perspective.

## Council templates

Built-in templates:

- Software Architecture Review
- Production Readiness Review
- Product / Feature Decision
- Database / Migration Review
- Security & Privacy Review
- Commercial / Pricing Board
- API / Integration Review
- Full Corporate Board

Templates are also CRUD-configurable. They choose a Chair and a set of member roles. When `defaultTemplate = auto`, a lightweight Council Planner chooses a relevant template and may add/remove roles. If that planner fails, a deterministic tag matcher provides a fallback.

## Deliberation protocol

1. Select template and roles.
2. Assign healthy heterogeneous models, preferring provider and model diversity.
3. Round 1: every member writes an independent structured position.
4. Chair evaluates agreement, blockers, evidence and dissent.
5. If consensus is not real, the Chair identifies exact disputes for the next round.
6. Members rebut/refine based on previous positions.
7. Stop early when consensus is achieved.
8. At the configured maximum round, the Chair either adjudicates with evidence or defers.

A member returns:

```json
{
  "position": "approve_with_changes",
  "confidence": 0.87,
  "summary": "...",
  "blocking_objections": [],
  "important_objections": ["..."],
  "recommendations": ["..."],
  "evidence": ["..."],
  "responses_to_peers": ["..."]
}
```

The Chair returns:

```json
{
  "status": "consensus",
  "consensus_reached": true,
  "consensus_score": 0.91,
  "decision": "...",
  "rationale": "...",
  "unresolved_blocking_issues": [],
  "required_changes": ["..."],
  "dissent": ["..."],
  "next_round_focus": []
}
```

The host does not trust that JSON blindly: `consensus` is accepted only when the Chair score, weighted member approval ratio and authoritative blocker policy also pass.

## DSH integration

### Native model tool

```text
ai_council
```

Arguments:

- `proposal` (required)
- `question`
- `context`
- `template` (`auto` or a template id)
- `role_ids` (explicit member override)

The result remains a structured DSH tool result internally, but the Web UI owns the `ai_council` keyed tool view and renders its report as normal Markdown prose.

### Commands

```text
/council [proposal]
/council-result [council-id]
/council-history
```

With the default `manualCommandBackground = true`, `/council` returns immediately with a council id instead of keeping the DSH command RPC open for several minutes. The host continues the deliberation, and a successful result is queued as model-visible plugin context for the main AI. `/council-result` reads it directly.

### Cordis service

The plugin publishes:

```js
ctx.get('aiCouncil')
```

with:

```js
{
  deliberate(options),
  roles(),
  templates(),
  history(id)
}
```

This is the integration seam for `dsh-second-opinion`, an autonomous dev-team plugin, or other DSH extensions that want to escalate unresolved decisions without shelling out to a command.

### Settings UI

**Settings → AI Council** contains:

- General configuration
- Roles (add/edit/duplicate/delete/restore)
- Templates (add/edit/delete/restore)
- History with full round transcript

Role and template state persists on the host.

## Model routing and self-healing

The router reads the live DSH provider/model catalog. It can:

- avoid the main conversation model
- prefer provider diversity
- prefer a unique model per role
- honor role-specific provider/model pins
- use role model-hint tokens as a soft preference
- skip models marked `dead` in the local `dsh-model-probe` state
- fail over to the next role candidate when a model errors, times out, or cannot return structured JSON

The role remains stable when a model changes.

## Persistence

Override with:

```text
DSH_AI_COUNCIL_STATE_FILE
```

Defaults:

- Windows: `%LOCALAPPDATA%\\dsh-ai-council\\state.json`
- macOS: `~/Library/Application Support/dsh-ai-council/state.json`
- Linux: `$XDG_STATE_HOME/dsh-ai-council/state.json` or `~/.local/state/dsh-ai-council/state.json`

The file stores configuration, roles, templates and bounded council history. It does **not** store provider API credentials.

## Install

From a local checkout:

```powershell
dsh plugin --profile default add .
dsh web
```

Or use the packed npm tarball through the DSH plugin installer supported by your profile workflow.

## Research rationale

The protocol was informed by recent multi-agent-deliberation work rather than assuming that "more agents talking longer" is automatically better:

- SWE-Debate uses specialized perspectives and structured competitive rounds for software issue resolution: https://arxiv.org/abs/2507.23348
- Dynamic Role Assignment for Multi-Agent Debate motivates matching heterogeneous models to predefined role functions: https://arxiv.org/abs/2601.17152
- *Voting or Consensus?* finds strong effects from the decision protocol and supports independent all-agent drafting before interaction: https://arxiv.org/abs/2502.19130
- ARMOR-MAD motivates heterogeneous model families, adaptive debate invocation and early agreement stopping: https://arxiv.org/abs/2606.13197

The plugin therefore uses independent Round 1 positions, heterogeneous routing, explicit roles, adaptive early stopping, bounded rounds, preserved dissent and evidence-weighted Chair synthesis.

## Current boundaries

0.1.0 is a real DSH host/client plugin, but it does not yet give Council members repository tools or MCP tools; they deliberate over the proposal/context supplied by the main agent. A later version can promote selected roles into full DSH child agents with role-specific tool policies when evidence collection needs direct repository or web access.

The plugin also does not claim that multi-model consensus guarantees correctness. Its purpose is to create a more disciplined, auditable decision process and to expose disagreement instead of hiding it.
