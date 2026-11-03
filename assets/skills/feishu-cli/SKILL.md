---
name: feishu-cli
description: "DeepSeek Harness 里的飞书/Lark CLI 入口：安装与登录检查、lark-cli 命令路由到对应的 lark-* skill、以及电子表格（Sheets）与多维表格（Base）的读写工作流。凡是要通过 lark-cli 访问飞书表格、Base、云文档、云空间、消息、日历、邮箱、任务等资源时，先读本 skill 再动手。"
metadata:
  requires:
    bins: ["lark-cli"]
    skills: ["lark-shared"]
---

# 飞书 CLI（DeepSeek Harness 版）

本 skill 是这个预设的总入口。它说明 **在这个 Harness 里** 怎么用飞书 CLI，
以及一个飞书请求应该路由到哪个 `lark-*` 领域 skill。

## 0. 先确认环境

```bash
lark-cli --version          # 命令是否存在、版本是否够新
lark-cli auth status        # 当前身份（user / bot）与已授权 scope
```

- **命令不存在**：本预设不含 CLI 本体，需要单独安装：
  `npx @larksuite/cli@latest install`（会自动安装 CLI 与官方 skills）。
  安装、`config init --new`、`auth login --recommend` 都属于**需要用户配合**的步骤：
  把授权链接原样转发给用户，不要自己编造或改写 URL。
- **未登录 / scope 不足**：读 [`../lark-shared/SKILL.md`](../lark-shared/SKILL.md)
  与 `lark-shared/references/lark-shared-identity-and-permissions.md`。
- 想加速落地：`lark-cli auth login --recommend` 一次拿到常用 scope。

## 1. 任务路由表

命中左列场景时，**先加载右列 skill，再动手**。所有 skill 都以
`lark-shared` 为公共底座（身份、权限、输出契约、高风险确认）。

| 场景 | skill |
|---|---|
| 认证、登录、身份切换、scope、`_notice`、退出码 10 | `lark-shared` |
| 电子表格：工作表结构、单元格读写、公式、图表、透视表、筛选视图、导入导出 | `lark-sheets` |
| 多维表格 Base：数据表/字段/记录/视图/仪表盘/表单/自动化/角色权限 | `lark-base` |
| 云文档 Docx / 思维笔记 / 文档内嵌资源 | `lark-doc` |
| 云空间：上传下载、目录、权限、评论、版本、导入导出 | `lark-drive` |
| 飞书内原生 Markdown 文件 | `lark-markdown` |
| 消息与群聊、卡片、表情回应、群成员 | `lark-im` |
| 日历、日程、忙闲、会议室、邀约 | `lark-calendar` |
| 视频会议、妙记（逐字稿/纪要/待办）、会中互动 | `lark-meeting` |
| 邮箱：搜索、读取、起草、发送、规则、模板 | `lark-mail` |
| 任务、清单、子任务、协作成员 | `lark-task` |
| 知识空间与节点 | `lark-wiki` |
| 幻灯片 | `lark-slides` |
| 画板（DSL / Mermaid / SVG） | `lark-whiteboard` |
| 通讯录、按姓名查 open_id | `lark-contact` |
| OKR | `lark-okr` |
| 审批实例与待办 | `lark-approval` |
| 考勤打卡记录 | `lark-attendance` |
| 实时事件订阅（WebSocket / NDJSON） | `lark-event` |
| 现有命令没覆盖的原生 OpenAPI | `lark-openapi-explorer` |
| 会议纪要汇总、日程待办摘要 | `lark-workflow-meeting-summary`、`lark-workflow-standup-report` |

## 2. 用哪个工具执行

两个都可以，按场景选：

- **`feishu_cli` 工具（首选）**：参数是 `args` 字符串数组，每个元素就是一个
  独立的命令行参数，**不需要任何引号或转义**。跨平台一致，最适合飞书 API 调用。

  ```
  feishu_cli(args=["sheets", "+read-data", "--spreadsheet", "shtcnXXXX",
                   "--range", "Sheet1!A1:D20"], description="读取表格前 20 行")
  feishu_cli(args=["base", "+record-search", "--app-token", "bascnXXXX",
                   "--table-id", "tblXXXX", "--page-size", "100"],
             description="查询多维表格记录")
  ```

- **pwsh / bash 工具**：需要在同一条流水线里做本地处理时用（`jq`、管道、
  `npx`、写临时文件）。注意 Windows 上是 PowerShell，不是 bash。

大 JSON、长文本一律走 `feishu_cli` 的 `stdin`，不要落盘再传路径。

## 3. 电子表格（Sheets）工作流

1. **定位资源**：用户给的是 URL 或 token？只从 URL 路径取 token
   （`/sheets/<token>`），不要因为域名不是 `feishu.cn` 就放弃——`doubao.com`
   等镜像域同样适用。
2. **先读结构再读写**：读 `lark-sheets/references/lark-sheets-workbook.md` 与
   `lark-sheets-read-data.md`，确认 worksheet / range 的真实名字；不要凭猜。
3. **读**：`sheets +read-data`，范围尽量小，分页读大表。
4. **写**：优先 `+write-cells` / `+batch-update`，一次提交一个连续区域；
   写入前用 `--dry-run` 预览请求体。
5. **验**：写完回读目标区域确认落值，再向用户汇报。

大表（几千行以上）不要整表拉进上下文：先读表头 + 前若干行确定结构，
再用**本地脚本**（Python/pandas 或 Node）做聚合，最后只把结论写回飞书。
本地脚本用 `pwsh` 工具跑，飞书侧只做读写。

## 4. 多维表格（Base）工作流

1. 读 `lark-base/references/lark-base-data-query.md` 与
   `lark-base-record-query-and-analysis-sop.md`。
2. **字段结构**：先查字段定义（`lark-base/references/lark-base-field-schema.md`），
   记录/批量写入的字段名与类型必须与定义一致，尤其公式、lookup、附件、人员字段。
3. **查询**：用 filter 条件（`lark-base-filter-condition.md`）在服务端过滤，
   不要全表拉取后再本地筛。
4. **写入**：批量创建/更新优先；单次记录数受 API 限制，注意分页与分批。
5. **视图 / 仪表盘 / 自动化**：分别读 `lark-base-view.md`、
   `lark-base-dashboard.md`、`lark-base-workflow.md`。

## 5. 输出契约（只看 `ok`）

`lark-cli` 默认 `--format json`：

- **成功**：stdout，退出码 0，信封形如
  `{ "ok": true, "data": ... }` —— **没有** 顶层 `code` / `msg`。
- **失败**：stderr，非 0 退出码，信封形如
  `{ "ok": false, "error": { "type": ..., "code": ..., "message": ..., "hint": ... } }`。

判断成功用 **`ok == true` 或退出码 0**，绝不能用 `code == 0`——
按老 OpenAPI 格式判断会把每一次成功都当成失败。
详见 `lark-shared/references/lark-shared-output-contract.md`。

`feishu_cli` 工具已经解析了 `ok`，结果里 `envelopeOk === false` 时会先给一行提示。

## 6. 路径与文件

`--file`、`--output`、`--output-dir`、`@file` **只接受相对于工作目录的路径**，
传绝对路径会报 `unsafe file path`。

- 上传：`workdir` 指到文件所在目录，参数里写 `./report.xlsx`。
- 下载：同样用 `workdir` + 相对路径，下载完再用文件工具读取/交付。
- 大 JSON：优先 `stdin`，绕开路径与转义问题。

## 7. 高风险操作

退出码 **10** 表示 `risk: "high-risk-write"` 的确认门禁，**不是错误**：

1. 停下，向用户展示 `action`、`risk` 和关键参数；
2. 取得用户**明确同意**；
3. 把 `hint` 指出的确认 flag **追加到原 argv 末尾**后重试。

不要静默加 flag 绕过。删除、批量覆盖、权限变更、群发消息一律先确认。
详细规则见 `lark-shared/references/lark-shared-high-risk-approval.md`。

## 8. 与 dsh-im 网关的关系

本预设负责"手"——读写飞书资源。若还想**在飞书里直接和这个 Agent 对话**
（群聊/私信即入口，消息事件驱动），再装 `@xmanrui/dsh-im`：
它把飞书作为 IM 通道接进 DSH。两者互补，不冲突：

- 只有本预设：Agent 能操作飞书，但你和它对话仍在 DSH Web/桌面端。
- 再加上 dsh-im：在飞书聊天窗口里直接下指令，Agent 用 `lark-cli` 干活并把结果回传。

安装与配置见本包 README 的「配合 dsh-im 使用」一节。
