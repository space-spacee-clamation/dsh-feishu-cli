# dsh-feishu-cli · Feishu CLI preset for DeepSeek Harness

Gives a DeepSeek Harness (DSH) agent **hands inside Feishu/Lark**: it can read and
write your spreadsheets, bitable (Base) tables, documents, drive files, chats,
calendar, mail and tasks instead of handing you text to paste.

This bundle packages the **complete AI Agent skill catalog** of the official
[Lark/Feishu CLI](https://github.com/larksuite/cli) as a DSH plugin, and adds a
`Feishu CLI` agent preset plus a `feishu_cli` tool.

- Upstream install guide: <https://open.feishu.cn/document/no_class/mcp-archive/feishu-cli-installation-guide.md>
- Skill source: <https://github.com/larksuite/cli> `skills/` (`@larksuite/cli` 1.0.98, MIT)
- 中文说明：[README.md](README.md)

## What you get

| Piece | Description |
|---|---|
| **`Feishu CLI` preset** | A complete agent composition — shell, filesystem, skills, jobs, web, subagents, compaction — plus the Feishu capability. Pick it when creating a session. |
| **29 skills** | The 28 upstream `lark-*` skills verbatim, plus a DSH-written `feishu-cli` entry skill (environment check, command routing, spreadsheet workflow, output contract, high-risk gate). |
| **`feishu_cli` tool** | Runs `lark-cli` with one array element per argument — no quoting or escaping — and parses the JSON envelope (`ok` / `error`). |
| **A prompt section** | Tells the model to route Feishu work through the tool, to load `lark-shared` first, that `ok == true` (not `code == 0`) means success, and that exit code 10 is a confirmation gate. |

The preset is self-contained and deliberately registers **no host-scope row**, so
the other presets in the profile (standard / ptc / minimal / cordis) keep exactly
the tools and skill catalog they had.

## Prerequisites

1. DSH (desktop or web).
2. Node.js + npm, to install `lark-cli`.
3. A Lark/Feishu app credential — `lark-cli config init --new` creates or selects one.

### Install and sign in to `lark-cli` (required; not bundled)

```bash
npx @larksuite/cli@latest install
lark-cli config init --new          # prints an authorization URL
lark-cli auth login --recommend     # act as you, with commonly used scopes
lark-cli auth status
```

All three need your confirmation in a browser. The CLI binary is intentionally
**not** redistributed here: installing a foreign binary and performing OAuth from
an npm postinstall would be an unreviewable side effect. The plugin only *uses*
`lark-cli`, so installation and authorization stay explicit.

If `lark-cli` is not on `PATH`, point `DSH_LARK_CLI_BIN` at the executable and
restart DSH.

## Install this plugin

Repository: <https://github.com/space-spacee-clamation/dsh-feishu-cli>

- **Web UI**: sidebar **Plugins** → install → `github:space-spacee-clamation/dsh-feishu-cli`.
  Then set **Settings → General → Agent preset** to `Feishu CLI` (or select it per session).
- **Ask the agent**: have it call `plugin_manager` with `action: install_bundle`
  (needs Full access or one approval).
- **Local checkout**: `plugin_manager(action: "install_bundle", target: "<absolute dir>")`.

Only **new** sessions can pick the new preset. Verify the composition with
`dsh --profile <profile> --dump-config`.

## Using it

Pick the `Feishu CLI` preset and ask in plain language:

- "Read this spreadsheet <link>, normalise column A to YYYY-MM-DD and write it back."
- "Turn this CSV into a bitable, infer each column type, and add a view grouped by status."
- "Summarise last week's meeting minutes into a Feishu doc."

### The `feishu_cli` tool

| Parameter | Type | Meaning |
|---|---|---|
| `args` | `string[]` | **Required.** Arguments after `lark-cli`; one array element per shell word. Do not quote or escape. |
| `description` | `string` | **Required.** 5–10 words describing the call (shown in the UI). |
| `stdin` | `string` | Piped input. Prefer it over temp files for large JSON or `@file` payloads. |
| `workdir` | `string` | Working directory. `lark-cli` file arguments accept **relative** paths only; uploads and downloads resolve here. |
| `timeoutMs` | `number` | Timeout; the executor applies its cap and kills the command on expiry. |

The result carries `exitCode`, `timedOut`, `envelopeOk`, `stdout` and `stderr`, and
surfaces `ok: false` / `error.message` when stdout is a `lark-cli` envelope.
Use the `pwsh` / `bash` tool instead when you need pipes, `jq`, or local scripting.

### Bundled skills

`feishu-cli` (new, DSH entry point), `lark-shared`, `lark-sheets`, `lark-base`,
`lark-doc`, `lark-drive`, `lark-markdown`, `lark-im`, `lark-calendar`,
`lark-meeting`, `lark-mail`, `lark-task`, `lark-wiki`, `lark-slides`,
`lark-whiteboard`, `lark-contact`, `lark-okr`, `lark-approval`,
`lark-attendance`, `lark-event`, `lark-openapi-explorer`, `lark-skill-maker`,
`lark-apps`, `lark-workflow-meeting-summary`, `lark-workflow-standup-report`,
and the compatibility shims `lark-minutes`, `lark-note`, `lark-vc`, `lark-vc-agent`.

## Use it with dsh-im (recommended)

**Yes, both can be installed, and they complement each other.**

- This preset is the **hands**: the agent reads and writes Feishu resources.
- [dsh-im](https://github.com/xmanrui/dsh-im) is the **gateway**: it connects
  Feishu as an IM channel, so you can message the agent from a Feishu DM or group
  and get the answer back in the same conversation.

Install `@xmanrui/dsh-im` as a bundle like any other, then **set that Feishu bot's
Agent Preset to `Feishu CLI`** in the bot settings and send `/new` so new sessions
use it. Optionally enable `groupByAgentPreset: true` in the plugin's host config
to give each preset its own workspace (see dsh-im's `docs/preset-workspaces.md`).

Order matters: complete `lark-cli config init` + `auth login` locally first — an
IM conversation cannot walk you through OAuth.

### Troubleshooting

| Symptom | Fix |
|---|---|
| `lark-cli: command not found` | `npx @larksuite/cli@latest install`, or set `DSH_LARK_CLI_BIN` and restart DSH. |
| `ok: false` with `Permission denied` / `missing_scopes` | `lark-cli auth login --scope "<missing_scope>"`; app-identity calls also need the scope enabled in the open platform console. |
| `auth status` reports `user: missing (DPoP key unavailable or inconsistent)` | The token survives but its DPoP private key cannot be read — common under a restricted process. Re-run `lark-cli auth login` in a normal terminal, or `lark-cli config set dpop disabled` then log in again. Until then only `--as bot` works. |
| `unsafe file path` | Use a path relative to `workdir`, e.g. `./report.xlsx`. |
| Exit code 10 | Not a failure: a high-risk write gate. Get explicit consent, then append the `hint` confirmation flag and retry. |
| No `Feishu CLI` in the preset list | Confirm the plugin is enabled; existing sessions never switch preset — create a new one. |

## Layout and self-check

```
package.json · cordis.patch.yml · lib/index.js
assets/skills/{28 lark-* skills, feishu-cli}
locale/{en,zh}.json · icon.svg · scripts/verify.mjs
```

```bash
node scripts/verify.mjs
# ok: 29 skills, tool feishu_cli, prompt section, quoting (win32)
```

## License

MIT for this package; `assets/skills/lark-*` are MIT content of `larksuite/cli`,
redistributed unmodified — see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

⚠️ Once authorized, the agent acts **as you** within the granted scopes. Use it as
a private assistant, do not add the bot to group chats or let others interact with
it, and confirm before writes or deletes.
