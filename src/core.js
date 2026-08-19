import { BUILTIN_ROLES, BUILTIN_TEMPLATES, DEFAULT_CONFIG } from './presets.js'

const ID_RE = /^[a-z][a-z0-9-]{1,63}$/
const POSITIONS = new Set(['approve','approve_with_changes','challenge','reject','abstain'])
const CHAIR_STATUS = new Set(['consensus','continue','adjudicated','defer'])

export function clone(value) { return structuredClone(value) }
export function clamp(n, min, max, fallback) { const x = Number(n); return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : fallback }
export function cleanString(value, max = 20_000) { return typeof value === 'string' ? value.trim().slice(0, max) : '' }
export function cleanArray(value, maxItems = 40, maxLen = 3000) {
  return Array.isArray(value) ? value.map(x => cleanString(x, maxLen)).filter(Boolean).slice(0, maxItems) : []
}
export function slug(value, fallback = 'custom-role') {
  const out = cleanString(value, 100).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
  return ID_RE.test(out) ? out : fallback
}

export function sanitizeConfig(input = {}) {
  const src = { ...DEFAULT_CONFIG, ...(input || {}) }
  return {
    enabled: src.enabled !== false,
    autoGuidance: src.autoGuidance !== false,
    defaultTemplate: cleanString(src.defaultTemplate, 64) || 'auto',
    minMembers: Math.round(clamp(src.minMembers, 2, 20, 3)),
    maxMembers: Math.round(clamp(src.maxMembers, 2, 20, 7)),
    maxRounds: Math.round(clamp(src.maxRounds, 1, 6, 3)),
    consensusThreshold: clamp(src.consensusThreshold, 0.5, 1, 0.8),
    requireNoBlocking: src.requireNoBlocking !== false,
    parallelism: Math.round(clamp(src.parallelism, 1, 12, 5)),
    timeoutMs: Math.round(clamp(src.timeoutMs, 5_000, 180_000, 45_000)),
    memberMaxTokens: Math.round(clamp(src.memberMaxTokens, 256, 12_000, 1800)),
    chairMaxTokens: Math.round(clamp(src.chairMaxTokens, 256, 12_000, 2200)),
    plannerMaxTokens: Math.round(clamp(src.plannerMaxTokens, 128, 4000, 900)),
    preferProviderDiversity: src.preferProviderDiversity !== false,
    avoidMainModel: src.avoidMainModel !== false,
    uniqueModelsPerCouncil: src.uniqueModelsPerCouncil !== false,
    useModelProbeHealth: src.useModelProbeHealth !== false,
    plannerProvider: cleanString(src.plannerProvider, 200),
    plannerModel: cleanString(src.plannerModel, 300),
    chairProvider: cleanString(src.chairProvider, 200),
    chairModel: cleanString(src.chairModel, 300),
    manualCommandBackground: src.manualCommandBackground !== false,
    historyLimit: Math.round(clamp(src.historyLimit, 10, 500, 100)),
  }
}

export function sanitizeRole(input = {}, existing) {
  const base = existing || {}
  const id = ID_RE.test(cleanString(input.id || base.id, 64)) ? cleanString(input.id || base.id, 64) : slug(input.name || base.name || 'custom-role')
  const type = input.type === 'chair' ? 'chair' : 'member'
  const mp = { ...(base.modelPolicy || {}), ...(input.modelPolicy || {}) }
  return {
    id,
    name: cleanString(input.name ?? base.name, 120) || id,
    description: cleanString(input.description ?? base.description, 1000),
    expertise: cleanArray(input.expertise ?? base.expertise, 40, 100),
    systemPrompt: cleanString(input.systemPrompt ?? base.systemPrompt, 30_000),
    type,
    weight: clamp(input.weight ?? base.weight, 0.1, 10, 1),
    blockingAuthority: Boolean(input.blockingAuthority ?? base.blockingAuthority),
    vetoCategories: cleanArray(input.vetoCategories ?? base.vetoCategories, 30, 100),
    modelHints: cleanArray(input.modelHints ?? base.modelHints, 30, 100),
    enabled: (input.enabled ?? base.enabled) !== false,
    builtin: Boolean(base.builtin ?? input.builtin),
    modelPolicy: {
      auto: mp.auto !== false,
      provider: cleanString(mp.provider, 200),
      model: cleanString(mp.model, 300),
    },
  }
}

export function sanitizeTemplate(input = {}, existing) {
  const base = existing || {}
  const id = ID_RE.test(cleanString(input.id || base.id, 64)) ? cleanString(input.id || base.id, 64) : slug(input.name || base.name || 'custom-template', 'custom-template')
  return {
    id,
    name: cleanString(input.name ?? base.name, 120) || id,
    description: cleanString(input.description ?? base.description, 1000),
    roleIds: cleanArray(input.roleIds ?? base.roleIds, 30, 64),
    chairRoleId: cleanString(input.chairRoleId ?? base.chairRoleId, 64),
    tags: cleanArray(input.tags ?? base.tags, 50, 100),
    enabled: (input.enabled ?? base.enabled) !== false,
    builtin: Boolean(base.builtin ?? input.builtin),
  }
}

export function defaultRoles() { return BUILTIN_ROLES.map(x => sanitizeRole(clone(x), x)) }
export function defaultTemplates() { return BUILTIN_TEMPLATES.map(x => sanitizeTemplate(clone(x), x)) }

export function extractJsonObject(text) {
  const src = cleanString(text, 200_000)
  if (!src) return undefined
  const fenced = src.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced?.[1]?.trim() || src
  try { const parsed = JSON.parse(candidate); if (parsed && typeof parsed === 'object') return parsed } catch {}
  const start = candidate.indexOf('{')
  if (start < 0) return undefined
  let depth = 0; let inString = false; let escape = false
  for (let i = start; i < candidate.length; i += 1) {
    const ch = candidate[i]
    if (inString) {
      if (escape) escape = false
      else if (ch === '\\') escape = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') { inString = true; continue }
    if (ch === '{') depth += 1
    if (ch === '}') {
      depth -= 1
      if (depth === 0) {
        try { return JSON.parse(candidate.slice(start, i + 1)) } catch { return undefined }
      }
    }
  }
  return undefined
}

export function normalizeMemberResponse(raw, role) {
  const obj = raw && typeof raw === 'object' ? raw : {}
  const position = POSITIONS.has(obj.position) ? obj.position : 'challenge'
  return {
    roleId: role.id,
    roleName: role.name,
    position,
    confidence: clamp(obj.confidence, 0, 1, 0.5),
    summary: cleanString(obj.summary, 5000) || 'No structured summary was returned.',
    blocking_objections: cleanArray(obj.blocking_objections, 20, 2000),
    important_objections: cleanArray(obj.important_objections, 30, 2000),
    recommendations: cleanArray(obj.recommendations, 30, 2000),
    evidence: cleanArray(obj.evidence, 30, 2500),
    responses_to_peers: cleanArray(obj.responses_to_peers, 30, 2500),
  }
}

export function normalizeChairResponse(raw, finalRound = false) {
  const obj = raw && typeof raw === 'object' ? raw : {}
  let status = CHAIR_STATUS.has(obj.status) ? obj.status : (obj.consensus_reached ? 'consensus' : 'continue')
  if (finalRound && status === 'continue') status = 'defer'
  if (!finalRound && (status === 'adjudicated' || status === 'defer')) status = 'continue'
  return {
    status,
    consensus_reached: Boolean(obj.consensus_reached),
    consensus_score: clamp(obj.consensus_score, 0, 1, 0.5),
    decision: cleanString(obj.decision, 8000),
    rationale: cleanString(obj.rationale, 8000),
    unresolved_blocking_issues: cleanArray(obj.unresolved_blocking_issues, 30, 2500),
    required_changes: cleanArray(obj.required_changes, 40, 2500),
    dissent: cleanArray(obj.dissent, 40, 2500),
    next_round_focus: cleanArray(obj.next_round_focus, 30, 2000),
  }
}

export function normalizePlannerResponse(raw, templates, roles) {
  const enabledTemplates = new Map(templates.filter(x => x.enabled).map(x => [x.id, x]))
  const enabledRoles = new Set(roles.filter(x => x.enabled).map(x => x.id))
  const obj = raw && typeof raw === 'object' ? raw : {}
  const templateId = enabledTemplates.has(obj.template_id) ? obj.template_id : ''
  return {
    templateId,
    addRoleIds: cleanArray(obj.add_role_ids, 12, 64).filter(x => enabledRoles.has(x)),
    removeRoleIds: cleanArray(obj.remove_role_ids, 12, 64).filter(x => enabledRoles.has(x)),
    reason: cleanString(obj.reason, 2000),
  }
}

export function deterministicTemplate(proposal, templates) {
  const text = cleanString(proposal, 50_000).toLowerCase()
  const scored = templates.filter(x => x.enabled).map(t => ({
    template: t,
    score: (t.tags || []).reduce((sum, tag) => sum + (text.includes(String(tag).toLowerCase()) ? 1 : 0), 0),
  })).sort((a, b) => b.score - a.score || a.template.name.localeCompare(b.template.name))
  return scored[0]?.template
}

export function chooseMembers({ template, roles, addRoleIds = [], removeRoleIds = [], minMembers = 3, maxMembers = 7 }) {
  const byId = new Map(roles.filter(x => x.enabled).map(x => [x.id, x]))
  const ids = []
  for (const id of [...(template?.roleIds || []), ...addRoleIds]) if (!ids.includes(id) && !removeRoleIds.includes(id) && byId.get(id)?.type !== 'chair') ids.push(id)
  if (ids.length < minMembers) {
    for (const role of roles) {
      if (role.enabled && role.type !== 'chair' && !ids.includes(role.id) && !removeRoleIds.includes(role.id)) ids.push(role.id)
      if (ids.length >= minMembers) break
    }
  }
  return ids.slice(0, Math.max(minMembers, maxMembers)).map(id => byId.get(id)).filter(Boolean).slice(0, maxMembers)
}

export function chooseChair(template, roles) {
  const enabled = roles.filter(x => x.enabled)
  return enabled.find(x => x.id === template?.chairRoleId && x.type === 'chair')
    || enabled.find(x => x.type === 'chair')
    || sanitizeRole(BUILTIN_ROLES.find(x => x.id === 'chair-technical-director'))
}

export function approvalRatio(memberResponses, rolesById) {
  let total = 0; let yes = 0
  for (const response of memberResponses) {
    if (response.position === 'abstain') continue
    const weight = rolesById.get(response.roleId)?.weight || 1
    total += weight
    if (response.position === 'approve' || response.position === 'approve_with_changes') yes += weight
  }
  return total > 0 ? yes / total : 0
}

export function authoritativeBlockingIssues(memberResponses, rolesById) {
  const out = []
  for (const response of memberResponses) {
    const role = rolesById.get(response.roleId)
    if (!role?.blockingAuthority) continue
    for (const issue of response.blocking_objections) out.push(`${role.name}: ${issue}`)
  }
  return out
}

export function evaluateConsensus({ chair, memberResponses, roles, threshold = 0.8, requireNoBlocking = true }) {
  const rolesById = new Map(roles.map(r => [r.id, r]))
  const ratio = approvalRatio(memberResponses, rolesById)
  const roleBlockers = authoritativeBlockingIssues(memberResponses, rolesById)
  const allBlockers = [...new Set([...roleBlockers, ...chair.unresolved_blocking_issues])]
  const reached = chair.consensus_reached === true
    && chair.status === 'consensus'
    && chair.consensus_score >= threshold
    && ratio >= threshold
    && (!requireNoBlocking || allBlockers.length === 0)
  return { reached, approvalRatio: ratio, blockers: allBlockers }
}

export function compactRound(round) {
  return round.members.map(m => ({
    roleId: m.roleId, roleName: m.roleName, position: m.position, confidence: m.confidence,
    summary: m.summary, blocking_objections: m.blocking_objections, important_objections: m.important_objections,
    recommendations: m.recommendations, evidence: m.evidence,
  }))
}

export function debateContext(rounds, chair) {
  const latest = rounds.at(-1)
  const members = latest ? compactRound(latest) : []
  return JSON.stringify({ previous_round: latest?.number || 0, members, chair_focus: chair?.next_round_focus || [], unresolved_blockers: chair?.unresolved_blocking_issues || [] }, null, 2)
}

export function formatCouncilMarkdown(result, { includeMembers = true } = {}) {
  if (!result) return '# AI Council Decision\n\nAI Council produced no result.'
  if (result.status === 'running') return `# AI Council\n\n**Running** · ${result.councilId}\n\nCouncil deliberation is still in progress.`
  if (result.status === 'failed') return `# AI Council Failed\n\n**Run:** \`${result.councilId}\`\n\n${result.error || 'Unknown failure.'}`
  const label = result.finalStatus === 'consensus' ? 'Consensus reached'
    : result.finalStatus === 'adjudicated' ? 'Chair adjudication'
      : result.finalStatus === 'defer' ? 'Decision deferred' : result.finalStatus || 'Completed'
  const confidence = Math.round((result.consensusScore || 0) * 100)
  const approval = Math.round((result.approvalRatio || 0) * 100)
  const lines = [
    '# AI Council Decision',
    '',
    `**${result.templateName || 'Custom Council'}** · **${label}**`,
    '',
    `- Consensus confidence: **${confidence}%**`,
    `- Weighted approval: **${approval}%**`,
    `- Debate rounds: **${result.rounds || 0}**`,
    '',
  ]
  if (result.decision) lines.push('## Conclusion', '', result.decision, '')
  if (result.rationale) lines.push('## Rationale', '', result.rationale, '')
  if (result.requiredChanges?.length) lines.push('## Required conditions / changes', '', ...result.requiredChanges.map(x => `- ${x}`), '')
  if (result.unresolvedBlockingIssues?.length) lines.push('## Unresolved blocking issues', '', ...result.unresolvedBlockingIssues.map(x => `- ${x}`), '')
  if (result.dissent?.length) lines.push('## Dissent preserved', '', ...result.dissent.map(x => `- ${x}`), '')
  if (includeMembers && result.members?.length) {
    const cell = value => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ')
    lines.push('## Council positions', '', '| Role | Position | Model | Confidence |', '|---|---|---|---:|')
    for (const m of result.members) {
      const model = m.provider && m.model ? `${m.provider}/${m.model}` : '—'
      lines.push(`| ${cell(m.roleName)} | ${cell(String(m.position || '').replaceAll('_', ' '))} | ${cell(model)} | ${Math.round((m.confidence || 0) * 100)}% |`)
    }
    lines.push('')
  }
  return lines.join('\n').trim()
}

export function historySummary(entry) {
  return {
    councilId: entry.councilId, createdAt: entry.createdAt, completedAt: entry.completedAt || '', status: entry.status,
    source: entry.source || '', templateId: entry.templateId || '', templateName: entry.templateName || '',
    finalStatus: entry.finalStatus || '', consensusScore: entry.consensusScore || 0,
    proposalPreview: cleanString(entry.proposal, 160), rounds: entry.rounds || 0,
    decisionPreview: cleanString(entry.decision, 220), error: cleanString(entry.error, 500),
  }
}
