# dsh-feishu-cli · 飞书 CLI 预设

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）装上**一双手**：
装上本插件后，Agent 可以直接读写你的飞书电子表格、多维表格（Base）、云文档、云空间、
聊天、日历、邮箱、任务……而不是给你一段让你自己粘贴的文字。

本包把官方 [飞书 CLI（`lark-cli`）](https://github.com/larksuite/cli) 的**全部 28 个
AI Agent Skill** 打包成一个 DSH 插件，并新增一个 `Feishu CLI` 预设与一个 `feishu_cli` 工具。

- 上游依据：<https://open.feishu.cn/document/no_class/mcp-archive/feishu-cli-installation-guide.md>
- 技能来源：<https://github.com/larksuite/cli> · `skills/`（`@larksuite/cli` 1.0.98，MIT）
- 英文说明：[README.en.md](README.en.md)

---

## 1. 这个包带来什么

| 组成 | 说明 |
|---|---|
| **预设 `Feishu CLI`** | 一个完整可用的 Agent 预设：shell、文件系统、技能、后台任务、Web、子 Agent、压缩策略，再叠加飞书能力。在 DSH 的新建会话界面里选择它即可。 |
| **29 个技能** | 28 个上游 `lark-*` 技能原样内置 + 1 个为 DSH 写的入口技能 `feishu-cli`（安装/登录检查、命令路由、表格工作流、输出契约、高风险确认）。 |
| **`feishu_cli` 工具** | 直接调用 `lark-cli`：参数以字符串数组传入，无需引号与转义；自动解析 JSON 输出信封（`ok` / `error`）。 |
| **一段系统提示** | 告诉模型"飞书的事走 `feishu_cli`，先读 `lark-shared`"，并写明 `ok == true` 才是成功、退出码 10 是确认门禁等硬规则。 |

预设是**自包含**的：它不修改、也不依赖其它预设。它有意**不注册任何 Host 级插件行**，
所以装到 profile 后，其它预设（standard / ptc / minimal / cordis）的工具与技能目录保持原样。

## 2. 前置条件

1. **DSH**（桌面版或 Web 版均可）。
2. **Node.js + npm**：用来安装 `lark-cli`。
3. **一个飞书应用凭证**：`lark-cli config init --new` 会自动创建或让你选择一个应用。

### 2.1 安装并登录 `lark-cli`（必需，本包不自带 CLI 本体）

```bash
npx @larksuite/cli@latest install        # 安装 lark-cli 及其官方 skills
lark-cli config init --new               # 生成/选择应用，输出授权链接
lark-cli auth login --recommend          # 以你的用户身份登录，自动勾选常用权限
lark-cli auth status                     # 验证
```

> 这三步都要你在浏览器里点确认。在 DSH 里你可以直接对 Agent 说
> "帮我安装飞书 CLI：https://open.feishu.cn/document/no_class/mcp-archive/feishu-cli-installation-guide.md"，
> 它会依次执行、把授权链接发给你，并在你完成后继续。

**为什么不在插件里装？** 因为 `lark-cli` 是一个独立二进制、需要用户交互授权，
把它塞进 npm 安装期会变成不可审查的副作用。插件只负责"使用它"，安装与授权仍然显式、可复现。

> 如果 `lark-cli` 不在 PATH 里，把它的绝对路径写进环境变量
> `DSH_LARK_CLI_BIN`（例如 `C:\Users\you\AppData\Roaming\npm\lark-cli.cmd`）。

## 3. 安装本插件

仓库：<https://github.com/space-spacee-clamation/dsh-feishu-cli>

### 方式 A：Web 界面（推荐）

DSH Web/桌面端 → 左侧 **Plugins** → 安装，填入：

```
github:space-spacee-clamation/dsh-feishu-cli
```

安装成功后，在 **Settings → General → Agent preset** 里把默认预设改成 `Feishu CLI`，
或只在需要飞书能力的会话里单独选择它。

### 方式 B：让 Agent 装

在本 profile 的任意会话里说"安装 dsh-feishu-cli 插件"，Agent 会用
`plugin_manager`（`action: install_bundle`）完成同样的事。该操作需要 Full access 或一次审批。

### 方式 C：本地目录

把仓库 clone 到本机，然后安装**绝对路径**：

```
plugin_manager(action: "install_bundle", target: "D:\\path\\to\\dsh-feishu-cli")
```

### 安装后会发生什么

- 插件列表里出现 **飞书 CLI**，预设列表里出现 **Feishu CLI**。
- **新会话**才能选到它；已存在的会话保持它启动时的预设。
- 想看合成结果：`dsh --profile <profile> --dump-config`。

## 4. 使用

### 4.1 选预设

新建会话 → 预设选 **Feishu CLI**。之后直接用自然语言提需求即可，例如：

- "读一下这个表格 <链接>，把 A 列的日期统一成 YYYY-MM-DD 再写回去。"
- "把这份 CSV 建成多维表格，字段按每列推断类型，再加一个按状态分组的视图。"
- "把上周所有会议的妙记总结成一篇云文档。"
- "查一下这个群最近 3 天有没有人提过 '报价'，有的话汇总给我。"

### 4.2 `feishu_cli` 工具

| 参数 | 类型 | 说明 |
|---|---|---|
| `args` | `string[]` | **必需**。`lark-cli` 之后的参数，一个数组元素 = 一个命令行参数，**不要**加引号或转义。 |
| `description` | `string` | **必需**。5–10 个字说明这次调用在做什么（显示在界面上）。 |
| `stdin` | `string` | 管道输入。大 JSON、`@file` 内容优先走这里，避免落盘与转义问题。 |
| `workdir` | `string` | 工作目录。`lark-cli` 的文件参数只接受**相对路径**，上传/下载都相对这里。 |
| `timeoutMs` | `number` | 超时；执行器会套用配置的上限并在超时时结束命令。 |

结果包含 `exitCode`、`timedOut`、`envelopeOk`、`stdout`、`stderr`。当输出是 `lark-cli`
的 JSON 信封时，工具会解析出 `ok`（失败时还会带 `error.message`），并在结果文本头部提示。

```text
feishu_cli(args=["sheets", "+read-data", "--spreadsheet", "shtcnXXXX", "--range", "Sheet1!A1:D20"],
           description="读取表格前 20 行")
feishu_cli(args=["base", "+record-search", "--app-token", "bascnXXXX", "--table-id", "tblXXXX",
                 "--page-size", "100"], description="查询多维表格记录")
feishu_cli(args=["--help"], description="查看命令总览")
```

> 需要管道、`jq`、本地脚本预处理时，改用预设里的 `pwsh`（Windows）/ `bash`（其它平台）工具。

### 4.3 内置技能

| 技能 | 覆盖 |
|---|---|
| `feishu-cli` | **本包新增**：DSH 入口、环境检查、命令路由、表格/Base 工作流、路径与高风险规则 |
| `lark-shared` | 认证、身份（`--as user/bot`）、权限与 scope、输出契约、高风险确认（其它技能公共底座） |
| `lark-sheets` | 电子表格：工作表结构、单元格读写、公式、图表、透视表、筛选视图、导入导出 |
| `lark-base` | 多维表格：数据表/字段/记录/视图/仪表盘/表单/自动化/角色权限 |
| `lark-doc` | 云文档、思维笔记、文档内嵌资源 |
| `lark-drive` | 云空间：上传下载、目录、权限、评论、版本、导入导出 |
| `lark-markdown` | 飞书内原生 Markdown 文件 |
| `lark-im` | 消息与群聊、交互卡片、表情回应、群成员 |
| `lark-calendar` | 日程、忙闲、会议室、邀约 |
| `lark-meeting` | 视频会议、妙记（纪要/逐字稿/待办）、会中互动 |
| `lark-mail` | 邮箱：搜索、读取、起草、发送、规则、模板 |
| `lark-task` | 任务、清单、子任务、协作成员 |
| `lark-wiki` | 知识空间与节点 |
| `lark-slides` | 幻灯片 |
| `lark-whiteboard` | 画板（DSL / Mermaid / SVG） |
| `lark-contact` | 通讯录、按姓名查 `open_id` |
| `lark-okr` | OKR |
| `lark-approval` | 审批实例与待办 |
| `lark-attendance` | 考勤打卡记录 |
| `lark-event` | 实时事件订阅（WebSocket / NDJSON） |
| `lark-openapi-explorer` | 现有命令没覆盖的原生 OpenAPI |
| `lark-skill-maker` | 自定义 lark skill 的框架 |
| `lark-apps` | 妙搭 / Spark / Miaoda 应用 |
| `lark-workflow-meeting-summary` | 工作流：会议纪要汇总 |
| `lark-workflow-standup-report` | 工作流：日程与待办摘要 |
| `lark-minutes` / `lark-note` / `lark-vc` / `lark-vc-agent` | 兼容入口，转向 `lark-meeting` |

## 5. 配合 dsh-im 使用（强烈推荐）

**可以同时安装，两者不冲突，而且是互补的。**

- 本预设给 Agent **手**：能读写飞书资源（`lark-cli`）。
- [dsh-im](https://github.com/xmanrui/dsh-im) 给 Agent **耳和口**：把飞书作为 IM 通道接进
  DSH，你在飞书的私聊/群聊里直接下指令，Agent 用 `lark-cli` 干完再把结果发回同一个会话。

**建议两个都装**：只用本预设，你仍然要回到 DSH 窗口里对话；加上 dsh-im 之后，
"在飞书里说一句 → Agent 读写表格 → 结果回到飞书"才形成闭环。

安装（与其它 bundle 一样）：

```
@xmanrui/dsh-im
```

在本机 profile 中它已经是已安装状态（见 `package.json` 的 `dsh.profile.bundles`）。
装完之后的关键一步是**把飞书机器人的 Agent Preset 指定为 `Feishu CLI`**：

1. dsh-im 的机器人设置里为该飞书机器人选择 Preset `Feishu CLI`；
2. 想按预设自动分工作区，可在该插件的 Host 配置里打开
   `groupByAgentPreset: true`（详见 dsh-im 的 `docs/preset-workspaces.md`）；
3. 在飞书里对机器人发 `/new`，之后的新会话就使用 `Feishu CLI` 预设。

> 顺序建议：**先**在本机把 `lark-cli` 的 `config init` + `auth login` 跑通（需要浏览器），
> **再**在飞书里对机器人提需求。IM 会话里没法帮你完成 OAuth 授权。

其它细节：dsh-im 覆盖微信 / 飞书 / 企业微信 / 钉钉 / QQ / Telegram / WhatsApp /
Slack / Discord / Matrix；它的 `dsh_im_*` 工具与本预设的 `feishu_cli` 可以同场使用。

## 6. 目录结构

```
dsh-feishu-cli/
├── package.json            # dsh.bundle.patch 指向 cordis.patch.yml
├── cordis.patch.yml        # 只插入一个 preset 行（无 Host 级行）
├── lib/index.js            # 技能 provider + feishu_cli 工具 + 系统提示段
├── assets/skills/          # 28 个 lark-* 技能（上游原样）+ feishu-cli（本项目）
├── locale/{en,zh}.json     # 插件列表里的标题与描述
├── icon.svg
├── scripts/verify.mjs      # 本地自检（不依赖 DSH）
└── THIRD_PARTY_NOTICES.md
```

自检：

```bash
node scripts/verify.mjs
# ok: 29 skills, tool feishu_cli, prompt section, quoting (win32)
```

## 7. 更新内置技能

```bash
# 取上游最新 skills/ 覆盖 assets/skills/lark-*
git clone --depth 1 https://github.com/larksuite/cli /tmp/lark-cli
rm -rf assets/skills/lark-*
cp -r /tmp/lark-cli/skills/lark-* assets/skills/
node scripts/verify.mjs
# 更新 THIRD_PARTY_NOTICES.md 里的版本号
```

## 8. 排错

| 现象 | 处理 |
|---|---|
| `feishu_cli` 报 `lark-cli: command not found` / `不是内部或外部命令` | `npx @larksuite/cli@latest install`，或设置 `DSH_LARK_CLI_BIN` 指向可执行文件后重启 DSH。 |
| 输出 `ok: false` + `Permission denied` / `missing_scopes` | 按提示补权限：`lark-cli auth login --scope "<missing_scope>"`；应用身份调用还需在开放平台后台开通。 |
| `授权码已过期` | OAuth 授权码只有几分钟，重跑 `lark-cli auth login`。 |
| `unsafe file path` | 上传/下载路径改成相对于 `workdir` 的相对路径，例如 `./report.xlsx`。 |
| 退出码 10 | 不是错误：这是高风险写操作确认门禁，让用户明确同意后再把 `hint` 里的确认 flag 追加到参数末尾重试。 |
| `auth status` 显示 `user: missing (DPoP key unavailable or inconsistent)` | 用户 token 本身还在，但绑定的 DPoP 私钥取不到（常见于在受限进程/沙箱里运行，读不到凭据存储）。在**普通终端**里重跑 `lark-cli auth login` 重新绑定；或先 `lark-cli config set dpop disabled` 再 `auth login`。修复前只有 `--as bot`（应用身份）可用。 |
| 预设列表里没有 `Feishu CLI` | 确认插件已启用；已存在的会话不会自动切换，新建一个会话。 |
| 装了 dsh-im 但飞书里没有飞书能力 | 在机器人设置里把 Agent Preset 选成 `Feishu CLI`，然后 `/new`。 |

## 9. 许可与来源

- 本包代码：MIT（见 [LICENSE](LICENSE)）。
- `assets/skills/lark-*`：来自 `larksuite/cli`，MIT，原样转载（见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)）。
- `assets/skills/feishu-cli`：本包原创，为 DSH 编写。
- 本包**不**内含 `lark-cli` 二进制，也不代你申请任何飞书权限。

> ⚠️ 安全提醒：一旦完成授权，Agent 会以**你的身份**在已授权范围内操作飞书，存在误操作与
> 提示注入风险。建议只把它当私人助手使用，不要拉进群聊或允许他人与它交互；写入/删除类操作
> 前先确认。
