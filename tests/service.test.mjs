import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AiCouncilService, CouncilStore } from '../src/index.js'

function chunks(text) {
  return (async function* () {
    yield { type:'text-delta', text }
    yield { type:'finish', reason:{kind:'stop'} }
  })()
}

function fakeCtx({ failFirst = false } = {}) {
  const registrations = { tools:[], commands:[], prompts:[], routes:[], services:new Map(), systems:[], calls:[] }
  let firstFailed = false
  const models = [
    {provider:'p1',id:'alpha-reasoning',name:'Alpha Reasoning'},
    {provider:'p2',id:'beta-coder',name:'Beta Coder'},
    {provider:'p3',id:'gamma-security',name:'Gamma Security'},
    {provider:'p4',id:'delta-architect',name:'Delta Architect'},
    {provider:'p5',id:'epsilon',name:'Epsilon'},
    {provider:'p6',id:'zeta',name:'Zeta'},
  ]
  const ctx = {
    llm: {
      listProviders(){ return [...new Set(models.map(m=>m.provider))].map(id=>({id,name:id.toUpperCase()})) },
      async listModels(provider){ return models.filter(m=>m.provider===provider).map(m=>({id:m.id,name:m.name})) },
      stream(options){
        registrations.calls.push({ provider:options.provider, model:options.model, purpose:options.purpose, system:options.system, prompt:options.messages?.[0]?.content?.[0]?.text || '' })
        if (failFirst && !firstFailed && String(options.purpose).includes('member:')) { firstFailed = true; throw new Error('simulated route failure') }
        const purpose = String(options.purpose || '')
        const prompt = options.messages?.[0]?.content?.[0]?.text || ''
        if (purpose.includes('planner')) return chunks(JSON.stringify({ template_id:'software-architecture', add_role_ids:[], remove_role_ids:[], reason:'architecture task' }))
        if (purpose.includes('chair:round-1')) return chunks(JSON.stringify({ status:'continue', consensus_reached:false, consensus_score:.62, decision:'', rationale:'Security objection unresolved.', unresolved_blocking_issues:['Security: auth edge case'], required_changes:['Resolve auth edge case'], dissent:[], next_round_focus:['Resolve auth edge case'] }))
        if (purpose.includes('chair:round-2')) return chunks(JSON.stringify({ status:'consensus', consensus_reached:true, consensus_score:.95, decision:'Proceed with the revised architecture.', rationale:'The security blocker was resolved and implementation is feasible.', unresolved_blocking_issues:[], required_changes:['Keep regression tests'], dissent:['Implementation still prefers a smaller patch.'], next_round_focus:[] }))
        const isRound2 = /ROUND: 2/.test(prompt)
        const isSecurity = /Security Architect/.test(options.system || '')
        if (!isRound2 && isSecurity) return chunks(JSON.stringify({ position:'challenge', confidence:.9, summary:'Auth path has an unresolved edge case.', blocking_objections:['Auth edge case'], important_objections:[], recommendations:['Add explicit auth guard'], evidence:['Current proposal does not specify the guard'], responses_to_peers:[] }))
        return chunks(JSON.stringify({ position:'approve', confidence:.88, summary:isRound2?'Peer objections are resolved in my domain.':'The plan is acceptable in my domain.', blocking_objections:[], important_objections:[], recommendations:['Keep tests'], evidence:['Constraints are satisfied'], responses_to_peers:isRound2?['Security objection addressed']:[] }))
      },
    },
    tools:{ register(def){registrations.tools.push(def); return ()=>{} } },
    commands:{ register(def){registrations.commands.push(def); return ()=>{} } },
    systemPrompt:{ section(def){registrations.prompts.push(def); return ()=>{} } },
    webServer:{ register(def){registrations.routes.push(def); return ()=>{} } },
    on(){ return ()=>{} },
    provide(name,value){ registrations.services.set(name,value); return ()=>registrations.services.delete(name) },
  }
  return { ctx, registrations }
}

function tempStore() {
  const dir = mkdtempSync(join(tmpdir(), 'aic-'))
  const store = new CouncilStore(join(dir, 'state.json'))
  store.setConfig({ minMembers:3, maxMembers:3, maxRounds:2, parallelism:3, avoidMainModel:false, uniqueModelsPerCouncil:true, consensusThreshold:.66 })
  return { store, cleanup:()=>rmSync(dir,{recursive:true,force:true}) }
}

test('registers a public service, native tool, commands, prompt and web routes', () => {
  const {ctx,registrations}=fakeCtx(); const {store,cleanup}=tempStore()
  try {
    const service=new AiCouncilService(ctx,store); service.start()
    assert.ok(registrations.services.has('aiCouncil'))
    assert.ok(registrations.tools.some(t=>t.name==='ai_council'))
    assert.deepEqual(registrations.commands.map(c=>c.name), ['council','council-result','council-history'])
    assert.ok(registrations.prompts.some(p=>p.name==='plugin:ai-council'))
    assert.ok(registrations.routes.length >= 8)
    service.dispose()
  } finally { cleanup() }
})

test('runs independent role prompts, a rebuttal round, and reaches checked consensus', async () => {
  const {ctx,registrations}=fakeCtx(); const {store,cleanup}=tempStore()
  try {
    const service=new AiCouncilService(ctx,store)
    const result=await service.runCouncil({
      proposal:'Adopt a new authentication-aware service architecture.', template:'software-architecture',
      roleIds:['principal-architect','staff-implementation','security-architect'], source:'test',
    })
    assert.equal(result.status,'ok')
    assert.equal(result.finalStatus,'consensus')
    assert.equal(result.consensusReached,true)
    assert.equal(result.rounds,2)
    assert.equal(result.members.length,3)
    assert.ok(new Set(result.members.map(m=>`${m.provider}/${m.model}`)).size >= 2)
    const memberSystems=registrations.calls.filter(c=>c.purpose.includes('member:')).map(c=>c.system)
    assert.ok(memberSystems.some(s=>/Principal Software Architect/.test(s)))
    assert.ok(memberSystems.some(s=>/Staff Implementation Engineer/.test(s)))
    assert.ok(memberSystems.some(s=>/Security Architect/.test(s)))
    const entry=store.history(result.councilId)
    assert.equal(entry.roundsTranscript.length,2)
    assert.equal(entry.phase,'completed')
    assert.ok(entry.events.some(e=>e.type==='planner.selected'))
    assert.ok(entry.events.some(e=>e.type==='round.started'))
    assert.ok(entry.events.some(e=>e.type==='council.completed'))
    assert.equal(entry.roundsTranscript[0].members.find(m=>m.roleId==='security-architect').position,'challenge')
  } finally { cleanup() }
})

test('a failed member route is replaced and the corporate role survives', async () => {
  const {ctx,registrations}=fakeCtx({failFirst:true}); const {store,cleanup}=tempStore()
  try {
    const service=new AiCouncilService(ctx,store)
    const result=await service.runCouncil({ proposal:'Review a service architecture.', template:'software-architecture', roleIds:['principal-architect','staff-implementation','security-architect'] })
    assert.equal(result.status,'ok')
    assert.ok(registrations.calls.filter(c=>c.purpose.includes('member:')).length > 6)
    assert.deepEqual(new Set(result.members.map(m=>m.roleId)),new Set(['principal-architect','staff-implementation','security-architect']))
  } finally { cleanup() }
})


test('runtime snapshot exposes real operator-facing subsystem state', async () => {
  const {ctx}=fakeCtx(); const {store,cleanup}=tempStore()
  try {
    const service=new AiCouncilService(ctx,store)
    const runtime=await service.runtimeSnapshot()
    assert.equal(runtime.subsystems.council.status,'ready')
    assert.equal(runtime.subsystems.router.models,6)
    assert.equal(runtime.subsystems.router.providers,6)
    assert.ok(runtime.subsystems.roleRegistry.memberRoles >= 10)
    assert.equal(runtime.subsystems.evidence.status,'limited')
    assert.equal(runtime.activeCount,0)
  } finally { cleanup() }
})



test('tool execution links the durable council run to the DSH tool call id', async () => {
  const {ctx}=fakeCtx(); const {store,cleanup}=tempStore()
  try {
    const service=new AiCouncilService(ctx,store)
    const result=await service.toolExecute({ proposal:'Review this architecture.', template:'software-architecture', role_ids:['principal-architect','staff-implementation','security-architect'] }, { callId:'call-live-123', signal:new AbortController().signal, agent:{ session:{requestContext(){return{provider:'main',model:'main'}}} } })
    assert.equal(result.status,'ok')
    assert.equal(store.history(result.councilId).toolCallId,'call-live-123')
    assert.equal(store.historyByToolCallId('call-live-123').councilId,result.councilId)
  } finally { cleanup() }
})

test('live round telemetry records member completions before the final durable result', async () => {
  const {ctx}=fakeCtx(); const {store,cleanup}=tempStore()
  try {
    const service=new AiCouncilService(ctx,store)
    const result=await service.runCouncil({ proposal:'Review a service architecture.', template:'software-architecture', roleIds:['principal-architect','staff-implementation','security-architect'] })
    const entry=store.history(result.councilId)
    assert.ok(entry.events.filter(e=>e.type==='member.completed').length >= 3)
    assert.equal(entry.liveRound,null)
    assert.match(result.markdown,/^# AI Council Decision/m)
    assert.match(result.markdown,/\| Role \| Position \| Model \| Confidence \|/)
  } finally { cleanup() }
})



test('live host route resolves the exact tool-linked council without exposing hidden context', async () => {
  const {ctx,registrations}=fakeCtx(); const {store,cleanup}=tempStore()
  try {
    const service=new AiCouncilService(ctx,store); service.start()
    store.beginHistory({ councilId:'council-live-route', source:'tool', proposal:'Visible proposal', context:'hidden context', toolCallId:'call-route-1', phase:'round-1-members', liveRound:{number:1,members:[]}, events:[] })
    const route=registrations.routes.find(r=>String(r.path).endsWith('/live'))
    assert.ok(route)
    let status=0; let payload=''
    const req={ method:'GET', headers:{'sec-fetch-site':'same-origin'}, url:'/api/ai-council/v1/live?callId=call-route-1' }
    const res={ writeHead(code){status=code}, end(text){payload=String(text||'')} }
    await route.handler(req,res)
    assert.equal(status,200)
    const body=JSON.parse(payload)
    assert.equal(body.entry.councilId,'council-live-route')
    assert.equal(body.entry.proposal,'Visible proposal')
    assert.equal(body.entry.liveRound.number,1)
    assert.equal('context' in body.entry,false)
    service.dispose()
  } finally { cleanup() }
})

test('background /council does not bind the autonomous deliberation to the command AbortSignal', async () => {
  const {ctx}=fakeCtx(); const {store,cleanup}=tempStore()
  try {
    const service=new AiCouncilService(ctx,store)
    let seenSignal
    service.runCouncil=async options=>{ seenSignal=options.signal; await new Promise(r=>setTimeout(r,5)); return {status:'ok',councilId:options.councilId,markdown:'# AI Council Decision\n\n## Conclusion\n\nUse option B.'} }
    const commandSignal=new AbortController().signal; const injected=[]
    const response=await service.manualCouncil({
      rawInput:'Choose implementation A or B', signal:commandSignal,
      agent:{ session:{deriveMessages(){return[]},requestContext(){return{provider:'main',model:'main'}}}, inject(m){injected.push(m)} },
    })
    assert.equal(response.kind,'success')
    assert.match(response.text,/AI Council started/)
    assert.notEqual(seenSignal,commandSignal)
    await Promise.all([...service.activeRuns.values()].map(x=>x.promise))
    assert.equal(injected.length,1)
    assert.match(injected[0].content[0].text,/# AI Council Decision/)
    assert.match(injected[0].content[0].text,/Use option B/)
  } finally { cleanup() }
})
