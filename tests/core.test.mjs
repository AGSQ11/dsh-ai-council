import test from 'node:test'
import assert from 'node:assert/strict'
import {
  defaultRoles, defaultTemplates, sanitizeRole, sanitizeConfig, extractJsonObject,
  deterministicTemplate, chooseMembers, chooseChair, evaluateConsensus, formatCouncilMarkdown,
} from '../src/core.js'

test('ships a broad editable corporate role registry with one chair', () => {
  const roles = defaultRoles()
  assert.equal(roles.length, 20)
  assert.equal(new Set(roles.map(r => r.id)).size, roles.length)
  assert.equal(roles.filter(r => r.type === 'chair').length, 1)
  for (const role of roles) {
    assert.ok(role.name.length > 3)
    assert.ok(role.systemPrompt.length > 250)
    assert.equal(role.builtin, true)
  }
  assert.ok(roles.some(r => r.id === 'staff-implementation'))
  assert.ok(roles.some(r => r.id === 'tech-stack-specialist'))
  assert.ok(roles.some(r => r.id === 'commercial-director'))
  assert.ok(roles.some(r => r.id === 'ui-ux-lead'))
})

test('custom roles retain independent system prompts and editable routing policy', () => {
  const role = sanitizeRole({
    id: 'hosting-abuse-director', name: 'Hosting Abuse Director', type: 'member', enabled: true,
    systemPrompt: 'Review abuse and fraud risk independently.', expertise: ['abuse','hosting'],
    blockingAuthority: true, vetoCategories: ['abuse'], modelPolicy: { auto: false, provider: 'brainz', model: 'nemotron' },
  })
  assert.equal(role.id, 'hosting-abuse-director')
  assert.equal(role.systemPrompt, 'Review abuse and fraud risk independently.')
  assert.deepEqual(role.expertise, ['abuse','hosting'])
  assert.equal(role.blockingAuthority, true)
  assert.equal(role.modelPolicy.provider, 'brainz')
})

test('built-in templates cover architecture, product, security and commercial boards', () => {
  const templates = defaultTemplates()
  assert.equal(templates.length, 8)
  assert.ok(templates.some(t => t.id === 'software-architecture'))
  assert.ok(templates.some(t => t.id === 'product-feature'))
  assert.ok(templates.some(t => t.id === 'security-review'))
  assert.ok(templates.some(t => t.id === 'commercial-pricing'))
})

test('deterministic planner fallback selects a relevant template', () => {
  const t = deterministicTemplate('We need a reversible PostgreSQL schema migration with rollback', defaultTemplates())
  assert.equal(t.id, 'database-migration')
})

test('member selection respects explicit template roles and bounds', () => {
  const roles = defaultRoles()
  const template = defaultTemplates().find(t => t.id === 'software-architecture')
  const members = chooseMembers({ template, roles, minMembers: 3, maxMembers: 5 })
  assert.equal(members.length, 5)
  assert.equal(members[0].id, 'cto-strategy')
  assert.ok(members.every(r => r.type === 'member'))
  assert.equal(chooseChair(template, roles).id, 'chair-technical-director')
})

test('consensus needs chair agreement, weighted member approval, and no authoritative blockers', () => {
  const roles = defaultRoles().filter(r => ['principal-architect','staff-implementation','security-architect'].includes(r.id))
  const base = [
    { roleId:'principal-architect', position:'approve', blocking_objections:[] },
    { roleId:'staff-implementation', position:'approve_with_changes', blocking_objections:[] },
    { roleId:'security-architect', position:'approve', blocking_objections:[] },
  ]
  const chair = { status:'consensus', consensus_reached:true, consensus_score:.92, unresolved_blocking_issues:[] }
  assert.equal(evaluateConsensus({ chair, memberResponses:base, roles, threshold:.8, requireNoBlocking:true }).reached, true)
  const blocked = structuredClone(base)
  blocked[2].blocking_objections = ['Authentication bypass remains possible']
  const result = evaluateConsensus({ chair, memberResponses:blocked, roles, threshold:.8, requireNoBlocking:true })
  assert.equal(result.reached, false)
  assert.match(result.blockers[0], /Security Architect/)
})

test('fenced and surrounding model JSON is recovered robustly', () => {
  assert.deepEqual(extractJsonObject('```json\n{"position":"approve"}\n```'), { position:'approve' })
  assert.deepEqual(extractJsonObject('thinking... {"status":"continue","consensus_score":0.4} trailing'), { status:'continue', consensus_score:.4 })
})

test('configuration is bounded to safe deliberation limits', () => {
  const cfg = sanitizeConfig({ maxRounds:99, parallelism:99, consensusThreshold:.1, timeoutMs:1 })
  assert.equal(cfg.maxRounds, 6)
  assert.equal(cfg.parallelism, 12)
  assert.equal(cfg.consensusThreshold, .5)
  assert.equal(cfg.timeoutMs, 5000)
})

test('council output is normal Markdown prose with members and dissent', () => {
  const text = formatCouncilMarkdown({
    status:'ok', councilId:'council-1', templateName:'Architecture', finalStatus:'consensus', consensusScore:.93, rounds:2,
    decision:'Use PostgreSQL.', rationale:'It preserves transactional consistency.', requiredChanges:['Add rollback.'], unresolvedBlockingIssues:[], dissent:['Performance preferred Redis.'],
    members:[{roleName:'Principal Architect',position:'approve',provider:'p',model:'m',confidence:.9}],
  })
  assert.match(text, /\*\*AI Council · Architecture\*\*/)
  assert.match(text, /Use PostgreSQL/)
  assert.doesNotMatch(text, /```/)
})
