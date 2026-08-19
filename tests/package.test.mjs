import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read=p=>readFile(new URL(`../${p}`,import.meta.url),'utf8')

test('package is an installable DSH bundle with native client dependencies', async () => {
  const pkg=JSON.parse(await read('package.json'))
  assert.equal(pkg.name,'dsh-ai-council')
  assert.equal(pkg.version,'0.3.0')
  assert.equal(pkg.author,'AGSQ11')
  assert.ok(pkg.keywords.includes('dsh-plugin'))
  assert.equal(pkg.dsh.bundle.patch,'./cordis.patch.yml')
  assert.ok(pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-tool'))
  assert.ok(pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-settings'))
})

test('host entrypoint has no runtime dependency on private DSH workspace packages', async () => {
  const source=await read('lib/index.js')
  assert.doesNotMatch(source,/from ['"]@deepseek-ai\//)
  await import(new URL('../lib/index.js',import.meta.url))
})

test('client owns Settings, tool view, and command views', async () => {
  const source=await read('lib/client.js')
  assert.match(source,/settings\.section/)
  assert.match(source,/Control Room/)
  assert.match(source,/conversation\.session\.header\.actions/)
  assert.match(source,/Subsystems/)
  assert.match(source,/Live Councils/)
  assert.match(source,/key:'ai_council'/)
  assert.match(source,/council-result/)
  assert.match(source,/MarkdownText/)
  assert.match(source,/Add role/)
  assert.match(source,/Role-specific system prompt/)
  assert.match(source,/Add template/)
  assert.match(source,/Control Room/)
  assert.match(source,/Model Probe/)
  assert.match(source,/Consensus Gate/)
  assert.match(source,/Show deliberation details/)
  assert.match(source,/useCouncilLive/)
  assert.match(source,/Convening AI Council/)
  assert.match(source,/\/live\?/)
})

test('source and prebuilt host modules remain synchronized', async () => {
  assert.equal(await read('src/index.js'),await read('lib/index.js'))
  assert.equal(await read('src/core.js'),await read('lib/core.js'))
  assert.equal(await read('src/presets.js'),await read('lib/presets.js'))
  assert.equal(await read('src/client.js'),await read('lib/client.js'))
})

test('cordis bundle inserts exactly one AI Council plugin row', async () => {
  const patch=await read('cordis.patch.yml')
  assert.match(patch,/id: ai-council/)
  assert.match(patch,/name: dsh-ai-council/)
})
