# Third-party notices

## lark-cli skills

`assets/skills/lark-*` are vendored, unmodified copies of the AI Agent Skills
shipped with the official Lark/Feishu CLI:

- Project: <https://github.com/larksuite/cli>
- Source path: `skills/<name>/`
- Upstream version: `@larksuite/cli` `1.0.98` (branch `main`)
- License: MIT (see the upstream `LICENSE` file)

They are redistributed here so that one bundle install delivers the complete
skill catalog to DeepSeek Harness. The `feishu-cli` skill in
`assets/skills/feishu-cli/` is NOT upstream content; it is original to this
package and written specifically for DeepSeek Harness.

To refresh the vendored skills, replace `assets/skills/lark-*` with a newer
checkout of that `skills/` directory and update the version above.

## lark-cli itself

This package does not bundle or redistribute the `lark-cli` executable. It
invokes whatever `lark-cli` is on `PATH` (or `DSH_LARK_CLI_BIN`). Install it
separately with `npx @larksuite/cli@latest install`, and review its own license
and security notes at <https://github.com/larksuite/cli>.
