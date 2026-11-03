/**
 * Feishu/Lark CLI capability for DeepSeek Harness agent presets.
 *
 * Three contributions, all scoped to the composition that mounts this plugin:
 *
 * 1. A bundled skill provider over `assets/skills/<name>/SKILL.md`, so every
 *    vendored `lark-*` skill appears in the session catalog and loads on demand
 *    with its `references/`, `scripts/`, and `assets/` directories intact.
 * 2. The `feishu_cli` model tool, which runs `lark-cli` through the `ctx.shell`
 *    seam so the standing sandbox, timeout, output cap, and job plumbing apply
 *    exactly as they do to the ordinary shell tools.
 * 3. One prompt section describing when to reach for the CLI and what its
 *    output contract means.
 *
 * The package is dependency-free on purpose: it imports only Node built-ins, so
 * it never pulls a second copy of a Harness package into the profile.
 *
 * @module @space-spacee-clamation/dsh-feishu-cli
 */
import { readdirSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { isAbsolute, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Cordis plugin identity. */
export const name = 'feishu-cli'

/** Services this plugin contributes to; every one of them is preset-scoped. */
export const inject = ['skills', 'tools', 'systemPrompt', 'shell', 'shellEnv', 'workingDirectory']

/** Provider name; the registry requires every candidate to report this exact value. */
const PROVIDER_NAME = 'dsh-feishu-cli'

/** Rank for packaged skill providers and local bundled roots. */
const BUNDLED_SKILL_RANK = 600

/** Absolute directory holding one `<name>/SKILL.md` bundle per skill. */
const SKILL_ROOT = fileURLToPath(new URL('../assets/skills/', import.meta.url))

/** The CLI entry point; `DSH_LARK_CLI_BIN` overrides it for non-PATH installs. */
const EXECUTABLE = process.env.DSH_LARK_CLI_BIN?.trim() || 'lark-cli'

/** Foreground budget for one CLI call before the executor kills it. */
const DEFAULT_TIMEOUT_MS = 120_000

/**
 * Read a scalar or block-scalar value out of a YAML frontmatter line.
 * Skills only ever need single-line quoted/plain scalars, so this stays a
 * deliberately small subset rather than a general YAML parser.
 *
 * @param value - the raw text after the key's colon.
 * @returns the unquoted scalar.
 */
function unquote(value) {
  const text = value.trim()
  if (text.length === 0) return ''
  const quote = text[0]
  if (text.length >= 2 && (quote === '"' || quote === "'") && text.endsWith(quote)) {
    if (quote === "'") return text.slice(1, -1).replaceAll("''", "'")
    try {
      return JSON.parse(text)
    } catch {
      return text.slice(1, -1)
    }
  }
  return text
}

/**
 * Split a skill file into its frontmatter mapping and its instruction body.
 * Nested mappings (`metadata:`) and comments are skipped; the body is the
 * remainder after the closing fence, which is what the model reads.
 *
 * @param raw - the complete `SKILL.md` text.
 * @returns the top-level frontmatter keys and the trimmed body.
 */
export function parseFrontmatter(raw) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(raw)
  if (match === null) return { data: {}, body: raw.trim() }
  const lines = match[1].split(/\r?\n/u)
  const data = {}
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.length === 0) continue
    if (line.startsWith(' ') || line.startsWith('\t') || line.startsWith('#')) continue
    const colon = line.indexOf(':')
    if (colon <= 0) continue
    const key = line.slice(0, colon).trim()
    if (key.length === 0) continue
    const value = line.slice(colon + 1).trim()
    if (value === '>' || value === '>-' || value === '|' || value === '|-') {
      const parts = []
      while (
        index + 1 < lines.length &&
        (lines[index + 1].startsWith(' ') || lines[index + 1].startsWith('\t'))
      ) {
        index += 1
        const part = lines[index].trim()
        if (part.length > 0) parts.push(part)
      }
      data[key] = parts.join(value.startsWith('>') ? ' ' : '\n')
      continue
    }
    data[key] = unquote(value)
  }
  return { data, body: raw.slice(match[0].length).trim() }
}

/**
 * Discover the vendored skills once, while the plugin applies. A skill whose
 * frontmatter carries no description is a packaging defect and fails loudly
 * instead of disappearing from the catalog with no diagnostic.
 *
 * @returns one registry candidate per skill directory, sorted by name.
 */
function discoverSkills() {
  const candidates = []
  for (const entry of readdirSync(SKILL_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const directory = join(SKILL_ROOT, entry.name)
    const locator = join(directory, 'SKILL.md')
    const { data } = parseFrontmatter(readFileSync(locator, 'utf8'))
    const skillName = typeof data.name === 'string' && data.name.length > 0 ? data.name : entry.name
    const description = typeof data.description === 'string' ? data.description.trim() : ''
    if (description.length === 0) {
      throw new Error(`feishu-cli: ${locator} has no frontmatter description`)
    }
    candidates.push({
      name: skillName,
      description,
      invocation: { modelInvocable: true, userInvocable: true },
      provider: PROVIDER_NAME,
      source: 'bundled',
      rank: BUNDLED_SKILL_RANK,
      resourceBase: { kind: 'directory', path: directory.split(sep).join('/') },
      locator,
    })
  }
  return candidates.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))
}

/**
 * Quote one argument for the shell dialect the executor runs.
 * PowerShell single-quoted strings double an embedded quote; POSIX shell
 * single-quoted strings close, escape, and reopen.
 *
 * @param argument - the raw argument text.
 * @returns the dialect-correct literal.
 */
function shellQuote(argument) {
  const text = String(argument)
  return process.platform === 'win32'
    ? `'${text.replaceAll("'", "''")}'`
    : `'${text.replaceAll("'", "'\\''")}'`
}

/**
 * Render the complete command line for one invocation. The executable itself
 * stays unquoted: PowerShell treats a quoted literal in command position as a
 * string expression rather than a command.
 *
 * @param argv - arguments after dropping any echoed executable name.
 * @returns the command line handed to `ctx.shell.resolve`.
 */
export function buildCommand(argv) {
  return `${EXECUTABLE} ${argv.map(shellQuote).join(' ')}`
}

/**
 * Read the `lark-cli` JSON envelope when stdout is one.
 * Success carries `ok: true` and no `code`; failure carries `ok: false` and an
 * `error` object, so `ok` — never `code` — decides success.
 *
 * @param text - the command's stdout.
 * @returns the observed envelope facts, or an empty object.
 */
function parseEnvelope(text) {
  const trimmed = text.trim()
  if (!trimmed.startsWith('{')) return {}
  let value
  try {
    value = JSON.parse(trimmed)
  } catch {
    return {}
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {}
  const ok = typeof value.ok === 'boolean' ? value.ok : undefined
  if (ok === undefined) return {}
  const message = value.error !== null && typeof value.error === 'object' ? value.error.message : undefined
  return {
    ok,
    ...(typeof message === 'string' && message.length > 0 ? { error: message } : {}),
  }
}

/**
 * Resolve a per-call workdir against the Session's current directory.
 *
 * @param modelWorkdir - the argument as the model supplied it.
 * @param sessionCwd - the Session's current directory, when it has one.
 * @returns the absolute workdir to request, or `undefined` for the default.
 */
function resolveWorkdir(modelWorkdir, sessionCwd) {
  if (modelWorkdir === undefined) return sessionCwd
  if (sessionCwd !== undefined && !isAbsolute(modelWorkdir)) return join(sessionCwd, modelWorkdir)
  return modelWorkdir
}

/**
 * Tool parameter schema.
 *
 * `tool.parameters` is consumed as JSON Schema directly, so `required` must be
 * the array form on the object node. The per-property `required: true` shorthand
 * only exists in the `defineTool` helpers shipped packages use, and this
 * dependency-free package does not import them.
 */
const PARAMETERS = {
  type: 'object',
  additionalProperties: false,
  required: ['description', 'args'],
  properties: {
    description: {
      type: 'string',
      description:
        'Clear, concise description of what this Feishu CLI call does in active voice, 5-10 words (shown in the UI).',
    },
    args: {
      type: 'array',
      items: { type: 'string' },
      description:
        'lark-cli arguments without the executable, one array element per shell word — for example ["sheets","+read-data","--spreadsheet","<token>","--range","Sheet1!A1:D20"]. Do not pass a single joined string and do not quote or escape anything; each element is passed as one literal argument. Start with `--help` or `lark-cli schema <method>` when unsure of the shape.',
    },
    stdin: {
      type: 'string',
      description:
        'Text piped to the command on stdin. Prefer it over a temp file for large JSON bodies or `@file` inputs.',
    },
    workdir: {
      type: 'string',
      description:
        'Working directory for this call. lark-cli accepts relative --file/--output paths only, so uploads and downloads resolve against this directory. Defaults to the session workspace; a relative path is resolved against it.',
    },
    timeoutMs: {
      type: 'number',
      description:
        'Timeout in milliseconds; the executor applies its configured cap and kills the command on expiry.',
    },
  },
}

/**
 * Register the bundled skill provider, the `feishu_cli` tool, and the prompt
 * section.
 *
 * @param ctx - the preset-scoped Cordis context.
 */
export function apply(ctx) {
  const candidates = discoverSkills()

  ctx.skills.registerProvider(() => ({
    name: PROVIDER_NAME,
    list: () => Promise.resolve(candidates),
    async get(candidate, options) {
      const { rank: _rank, locator, ...summary } = candidate
      const raw = await readFile(locator, { encoding: 'utf8', signal: options.signal })
      return { ...summary, content: parseFrontmatter(raw).body }
    },
  }))

  const sandboxPolicy = ctx.get('sandboxPolicy')

  ctx.systemPrompt.section({
    name: 'tool:feishu-cli',
    order: 60,
    text: [
      'Feishu (Lark) work goes through the `feishu_cli` tool, which runs `lark-cli`. The vendored `lark-*` skills are the authority on flags and workflows.',
      '',
      '- Load `lark-shared` first for any lark-cli task: identity (`--as user` vs `--as bot`), auth, permissions, and safety rules. Then load the domain skill (`lark-sheets`, `lark-base`, `lark-doc`, `lark-drive`, ...) and read the references it points at before composing an unfamiliar command.',
      '- Success is `ok == true` in the JSON envelope or exit code 0 — never `code == 0`. Errors land on stderr with `ok: false` and an `error` object.',
      '- Exit code 10 is a high-risk confirmation gate, not a failure: stop, show the user the `action`, `risk`, and key parameters, and retry with the confirmation flag only after they explicitly agree.',
      '- `--file` / `--output` / `@file` accept paths relative to the workdir only; absolute paths are rejected as unsafe. Pass big payloads on stdin.',
      '- Preview side effects with `--dry-run` where the command supports it, and confirm intent before writes or deletes.',
    ].join('\n'),
  })

  ctx.tools.register({
    name: 'feishu_cli',
    description:
      'Run the Feishu/Lark CLI (`lark-cli`) and return its stdout/stderr. Use it for spreadsheets, bitable (Base), documents, drive files, chats, calendar, mail, tasks, wiki, approval, OKR, meetings, slides, and whiteboards. Arguments are passed as one literal shell word each, so quoting and escaping are never needed. Output defaults to the JSON envelope: success is `ok == true` or exit code 0, never `code == 0`. Load the matching `lark-*` skill before an unfamiliar command.',
    parameters: PARAMETERS,
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: [
          'command',
          'workdir',
          'exitCode',
          'timedOut',
          'aborted',
          'timeoutMs',
          'envelopeOk',
          'stdout',
          'stdoutTruncated',
          'stderr',
        ],
        properties: {
          command: { type: 'string' },
          workdir: { type: 'string' },
          exitCode: { oneOf: [{ type: 'integer' }, { type: 'null' }] },
          timedOut: { type: 'boolean' },
          aborted: { type: 'boolean' },
          timeoutMs: { type: 'number' },
          envelopeOk: { oneOf: [{ type: 'boolean' }, { type: 'null' }] },
          error: { type: 'string' },
          stdout: { type: 'string' },
          stdoutTruncated: { type: 'boolean' },
          stderr: { type: 'string' },
        },
      },
      render: (_args, value) => {
        const lines = []
        if (value.envelopeOk === false) {
          lines.push(
            value.error === undefined
              ? 'lark-cli reported ok=false'
              : `lark-cli reported ok=false: ${value.error}`,
          )
        }
        let body = value.stdout
        if (value.stderr.length > 0) {
          if (body.length > 0 && !body.endsWith('\n')) body += '\n'
          body += `[stderr]\n${value.stderr}`
        }
        lines.push(body.length === 0 ? '(no output)' : body)
        if (value.stdoutTruncated) lines.push('[stdout truncated by the shell executor]')
        if (value.timedOut) lines.push(`[timed out after ${value.timeoutMs}ms]`)
        else if (value.aborted) lines.push('[aborted]')
        else if (value.exitCode !== null && value.exitCode !== 0) lines.push(`[exit code: ${value.exitCode}]`)
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    presentCall: (args) => ({
      card: 'terminal',
      title: `${EXECUTABLE} ${Array.isArray(args.args) ? args.args.join(' ') : ''}`.trim(),
      description: args.description,
      ...(args.workdir === undefined ? {} : { cwd: args.workdir }),
    }),
    async execute(args, exec) {
      const argv = Array.isArray(args.args) ? args.args.map((argument) => String(argument)) : []
      if (argv.length > 0 && (argv[0] === EXECUTABLE || argv[0] === 'lark-cli')) argv.shift()
      if (argv.length === 0) {
        throw new Error('invalid args: expected a non-empty array of lark-cli arguments')
      }
      if (args.timeoutMs !== undefined && (!Number.isFinite(args.timeoutMs) || args.timeoutMs <= 0)) {
        throw new Error(`invalid timeoutMs: expected a positive number, got ${JSON.stringify(args.timeoutMs)}`)
      }
      const sessionCwd =
        exec.agent === undefined ? undefined : await ctx.workingDirectory.ensure(exec.agent, exec.signal)
      const workdir = resolveWorkdir(args.workdir, sessionCwd)
      const policy =
        sandboxPolicy === undefined
          ? undefined
          : sandboxPolicy.resolve(exec.agent === undefined ? {} : { session: exec.agent.session })
      const spec = ctx.shell.resolve({
        command: buildCommand(argv),
        ...(workdir === undefined ? {} : { workdir }),
        timeoutMs: args.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        ...(args.stdin === undefined ? {} : { stdin: args.stdin }),
        dshEnv: ctx.shellEnv.collect(exec),
        ...(policy === undefined ? {} : { sandboxPolicy: policy }),
        signal: exec.signal,
      })
      const result = await (await ctx.shell.execute(spec)).result()
      const envelope = parseEnvelope(result.stdout.text)
      return {
        command: spec.command,
        workdir: spec.workdir,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        aborted: result.aborted,
        timeoutMs: result.timeoutMs,
        envelopeOk: envelope.ok ?? null,
        ...(envelope.error === undefined ? {} : { error: envelope.error }),
        stdout: result.stdout.text,
        stdoutTruncated: result.stdout.truncated,
        stderr: result.stderr.text,
      }
    },
  })
}
