// Local self-check for the bundle: runs the plugin against a fake Cordis
// context so a broken skill file, a bad tool schema, or a quoting mistake
// fails here instead of at preset activation.
//
//   node scripts/verify.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { apply, buildCommand, inject, name, parseFrontmatter } from '../lib/index.js'

const registered = { provider: undefined, tool: undefined, section: undefined }
const specs = []

const fakeResult = {
  exitCode: 0,
  signal: null,
  timedOut: false,
  aborted: false,
  timeoutMs: 120000,
  stdout: { text: '{"ok":true,"data":{"rows":1}}', truncated: false },
  stderr: { text: '', truncated: false },
}

const ctx = {
  skills: {
    registerProvider(create) {
      registered.provider = create({ signal: new AbortController().signal, invalidate() {} })
      return () => {}
    },
  },
  tools: {
    register(definition) {
      registered.tool = definition
      return () => {}
    },
  },
  systemPrompt: {
    section(section) {
      registered.section = section
      return () => {}
    },
  },
  get() {
    return undefined
  },
  shell: {
    resolve(request) {
      return {
        onExpiry: 'kill',
        stdoutMaxBytes: 65536,
        workdir: '/ws',
        ...request,
      }
    },
    async execute(spec) {
      specs.push(spec)
      return { result: async () => ({ ...fakeResult, timeoutMs: spec.timeoutMs }) }
    },
  },
  shellEnv: { collect: () => ({}) },
  workingDirectory: { ensure: async () => '/ws' },
}

// ── manifest and patch wiring ───────────────────────────────────────────────
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
assert.equal(manifest.name, '@space-spacee-clamation/dsh-feishu-cli')
assert.ok(manifest.files.includes('assets'), 'assets must ship in the packed file list')
assert.ok(manifest.files.includes('lib'), 'lib must ship in the packed file list')

const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
assert.ok(patch.includes('preset-feishu-cli'), 'patch must declare the preset row')
assert.ok(
  patch.includes(`name: '${manifest.name}'`),
  'the preset must mount this exact package name',
)
// Only the preset row may sit at patch top level; a host-scope `- id:` row
// would leak the provider and the tool into every other preset.
assert.ok(!/^- id: /mu.test(patch), 'the bundle must not override a host-scope row')
assert.equal((patch.match(/^- insert:$/gmu) ?? []).length, 1, 'expected exactly one insert block')

// ── plugin identity ─────────────────────────────────────────────────────────
assert.equal(name, 'feishu-cli')
for (const service of ['skills', 'tools', 'systemPrompt', 'shell', 'shellEnv', 'workingDirectory']) {
  assert.ok(inject.includes(service), `inject must list ${service}`)
}

// ── skill provider ──────────────────────────────────────────────────────────
apply(ctx)

const provider = registered.provider
assert.ok(provider, 'apply must register a skill provider')
assert.equal(provider.name, 'dsh-feishu-cli')

const candidates = await provider.list()
assert.ok(candidates.length >= 29, `expected the full catalog, got ${candidates.length}`)
assert.equal(new Set(candidates.map((candidate) => candidate.name)).size, candidates.length, 'duplicate skill names')
assert.ok(candidates.some((candidate) => candidate.name === 'feishu-cli'), 'missing the DSH entry skill')
for (const domain of ['lark-shared', 'lark-sheets', 'lark-base', 'lark-doc', 'lark-drive', 'lark-im']) {
  assert.ok(candidates.some((candidate) => candidate.name === domain), `missing ${domain}`)
}

for (const candidate of candidates) {
  const loaded = await provider.get(candidate, { signal: new AbortController().signal })
  assert.equal(loaded.name, candidate.name)
  assert.equal(loaded.provider, 'dsh-feishu-cli', `${candidate.name}: provider must match the candidate`)
  assert.ok(loaded.content.length > 0, `${candidate.name}: empty body`)
  assert.ok(!loaded.content.startsWith('---'), `${candidate.name}: frontmatter leaked into the body`)
  assert.ok(loaded.description.length > 0, `${candidate.name}: empty description`)
  assert.ok(loaded.resourceBase.path.endsWith(`/skills/${candidate.name}`), `${candidate.name}: bad resource base`)
}

// The bundled skills must keep their references reachable from the skill dir.
const sheets = candidates.find((candidate) => candidate.name === 'lark-sheets')
const sheetsBody = (await provider.get(sheets, { signal: new AbortController().signal })).content
assert.ok(sheetsBody.includes('references/'), 'lark-sheets body should point at references/')

// ── prompt section ──────────────────────────────────────────────────────────
assert.equal(registered.section.name, 'tool:feishu-cli')
assert.ok(Number.isFinite(registered.section.order))
assert.ok(registered.section.text.includes('ok == true'))

// ── tool definition ─────────────────────────────────────────────────────────
const tool = registered.tool
assert.equal(tool.name, 'feishu_cli')
assert.equal(typeof tool.execute, 'function')
assert.equal(typeof tool.output.render, 'function')
// `parameters` is JSON Schema: `required` must be the array form on the object
// node, and no property may carry the `defineTool`-only `required: true`.
assert.equal(tool.parameters.type, 'object')
assert.deepEqual([...tool.parameters.required].sort(), ['args', 'description'])
assert.equal(tool.parameters.properties.args.items.type, 'string')
for (const [key, node] of Object.entries(tool.parameters.properties)) {
  assert.equal(node.required, undefined, `parameters.${key} must not use the required:true shorthand`)
}
assert.equal(tool.output.schema.type, 'object')
assert.ok(Array.isArray(tool.output.schema.required), 'output schema needs the array form of required')
for (const [key, node] of Object.entries(tool.output.schema.properties)) {
  assert.equal(node.required, undefined, `output.${key} must not use the required:true shorthand`)
}

const value = await tool.execute(
  { args: ['sheets', '+read-data', "--id", "it's", '--range', 'Sheet1!A1:B2'], description: 'read' },
  { agent: undefined, signal: new AbortController().signal, callId: 'c1', name: 'feishu_cli' },
)
assert.equal(specs.length, 1)
const expectedQuote = process.platform === 'win32' ? "'it''s'" : "'it'\\''s'"
assert.equal(specs[0].command, `lark-cli 'sheets' '+read-data' '--id' ${expectedQuote} '--range' 'Sheet1!A1:B2'`)
assert.equal(value.envelopeOk, true)
assert.equal(value.exitCode, 0)
assert.equal(value.workdir, '/ws')
assert.deepEqual(tool.output.render({}, value), [{ type: 'text', text: '{"ok":true,"data":{"rows":1}}' }])

// An echoed executable name is tolerated, and an empty argv is rejected.
await tool.execute(
  { args: ['lark-cli', 'auth', 'status'], description: 'status' },
  { agent: undefined, signal: new AbortController().signal, callId: 'c2', name: 'feishu_cli' },
)
assert.equal(specs[1].command, "lark-cli 'auth' 'status'")
await assert.rejects(() =>
  tool.execute(
    { args: [], description: 'nothing' },
    { agent: undefined, signal: new AbortController().signal, callId: 'c3', name: 'feishu_cli' },
  ),
)

// ── frontmatter parser ──────────────────────────────────────────────────────
assert.deepEqual(parseFrontmatter('---\nname: a-b\ndescription: "quoted: value"\n---\n\nbody\n'), {
  data: { name: 'a-b', description: 'quoted: value' },
  body: 'body',
})
assert.equal(parseFrontmatter('---\ndescription: >\n  one\n  two\nmetadata:\n  x: 1\n---\nbody\n').data.description, 'one two')
assert.equal(parseFrontmatter('no frontmatter').body, 'no frontmatter')

console.log(`ok: ${candidates.length} skills, tool feishu_cli, prompt section, quoting (${process.platform})`)
