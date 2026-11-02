# magpie-atomcode

简体中文 | [English](README.md)

把 **ATOMCODE（AtomGit CodingPlan）** 接入 [magpie](https://usemagpie.ai) 的供应商插件（非官方）。

通过 AtomGit 浏览器授权，或复用本机官方 AtomCode CLI 的登录后，CodingPlan
的模型会以供应商 **ATOMCODE** 出现在 magpie 里；Claude Code、Codex、
OpenCode 等任何 Agent 都能选 `atomcode/<模型>` 使用。套餐信息、每日签到与
滚动额度窗口，都显示在 magpie 的账号行、`magpie quota` 和设置里。

```
Agent (Claude Code / Codex / OpenCode / …)
   │ 任意 API
   ▼
magpie 网关 ──► magpie-atomcode（补 atomcode-signing-v1 签名 + UA）
   ▼
https://llm-api.atomgit.com/v1（OpenAI 兼容，SSE 原样流回）
```

## 功能

- **两种登录方式**：AtomGit 浏览器 OAuth，或复用官方 AtomCode CLI 的
  `~/.atomcode/auth.toml`。CLI 来源每次请求前重读；续期结果以 `0600`
  权限原子回写，不破坏无关 TOML 内容。
- **可靠续期**：刷新单飞加内存结果缓存，避免 refresh token 轮换后被旧 token
  再刷一次；网关返回 401 时会强制续期并只重试一次，旧宿主没有
  `auth.refresh` 也能工作。
- **直连 AtomGit**：不需要 Atom2Api 常驻；流式、工具调用和推理档位 variants
  都声明给宿主。
- **每日签到（checkin）**：magpie 原生签到开关调度。套餐有效 → done；到期/缺失 → 按官方 Max→Pro→Lite 级联自动重领；名额满 → failed 并显示上游原因。
- **额度窗口**：显示套餐名、到期时间、上游返回的每个限流窗口，并在上游提供
  token 口径时一并显示。
- **自动追版本**：默认跟随 AtomCode 官方仓库的最新版本号（官方客户端会强制更新），拉取失败退回内置版本，绝不阻塞请求。
- **模型目录动态拉取**：每个账号自己的目录（随套餐/档位而变），离线时用内置快照兜底。

## 当前模型（2026-11-02 实测快照）

| 模型 | 上下文 | 推理档位 | 视觉 |
|---|---|---|---|
| `glm5.3-flash` | 500K | low / high | ✓ |
| `qwen3.8-27b` | 256K | low / medium / xhigh | ✓ |
| `deepseek-flash` | 1M | high / max | ✓ |

目录随账号与套餐动态变化，以登录后拉取的为准。

## 安装

```bash
# 文件夹方式（就地加载）
magpie plugin add /path/to/magpie-atomcode/packages/atomcode
# 社区/npm 包（发布后）
magpie plugin add npm:@magpie-community/opencode-atomcode-auth
```

包面向 magpie `>=0.1.2563`。仓库目录已经对齐
`magpie-community/plugins/packages/atomcode`，可直接迁移。OpenCode 保持可加载，
但真实 OpenCode 宿主契约尚未验证，因此暂标为实验性。

## 登录与签到

```bash
magpie plugin login atomcode 1   # 浏览器 OAuth
magpie plugin login atomcode 2   # 复用本机 AtomCode CLI 登录
```

- CLI 复用会读取 `~/.atomcode/auth.toml`，只接受权限不宽于 `0600` 的普通文件，
  拒绝符号链接；续期后原子回写，让官方 CLI 与 magpie 保持同一条 refresh 链。
- 该文件是 CLI 与插件共享状态。如果本机登录切换了账号，需要重新登录 magpie，
  避免用一个账号的 `uid` 给另一个账号的 access token 签名。
- 签到：magpie 设置 → 插件里的签到开关（「每天让 ATOMCODE 插件给每个已登录的账号签到一次」）。即使不开，套餐到期后额度/目录读取时也会自动补领（30 分钟冷却）。
- 套餐名额：Lite 限量 1000 人/日；Pro 体验版每日 10:00 放 100 个名额。抢满时签到会失败并显示原因，明天再试即可。

## 选项（`plugins.json` 的 options；都有默认值）

| 选项 | 默认 | 说明 |
|---|---|---|
| `locale` | auto（跟机器） | `zh` / `en` |
| `autoVersion` | `true` | 自动跟随 AtomCode 官方仓库的最新版本号 |
| `clientVersion` | `5.2.3` | 兜底版本号（`autoVersion` 拉取失败或关闭时用） |
| `autoClaim` | `true` | 登录后幂等领取 + 到期自动重领（关闭后只剩手动签到） |
| `masterKeyHex` | 内置 | 上游更换签名密钥时的热修逃生口（64 位 hex） |
| `platformBaseURL` | `https://acs.atomgit.com` | OAuth broker 地址 |
| `codingPlanAPIURL` | `https://api.gitcode.com/api/v5` | CodingPlan REST 地址 |
| `quotaTtlMs` | `60000` | 额度缓存时长 |
| `maxOutputTokens` | `32768` | 模型 output 上限兜底 |

## 安全边界

下面这些都在代码里强制，`npm test` 逐一覆盖：

- **只有官方网关是目的地。** `loader.fetch` 在任何异步读取凭证之前先冻结已验证
  的 URL，再把 origin 与 `https://llm-api.atomgit.com` 比对。调用方无法在等待
  期间修改 `URL` 对象把签名流量引到别处；协议和端口都参与比较。
- **上游改不动目的地。** 模型行里的 `base_url` 只有 origin 与签名网关完全一致时才被采纳，否则该模型回退官方网关并记录日志。
- **端点选项使用精确主机。** `platformBaseURL` 只接受
  `acs.atomgit.com`；`codingPlanAPIURL` 只接受 `api.gitcode.com`（允许改路径）。
  两者都必须是 443 端口上的 HTTPS；否则回退官方端点并输出脱敏告警。
- **读取有上限、跳转被拒绝。** 版本、OAuth、CodingPlan 的响应体都在流式读取时限制为 1 MiB；所有元数据请求都有超时且拒绝跳转。broker 返回的登录地址也必须位于 AtomGit。
- **只接受可精确签名的请求体。** 字符串、字节缓冲区、TypedArray、`ArrayBuffer`
  和 `Blob` 会按实际发送字节签名；流、`FormData`、`URLSearchParams` 直接拒绝，
  避免签的字节和线上字节不一致。缓冲的请求体上限为 64 MiB。
- **签名覆盖最终字节。** 流式 Chat Completions 若没有显式设置
  `stream_options.include_usage`，插件会补 `include_usage: true`，序列化后再签名。
- **日志脱敏。** 上游响应正文不会塞进异常；非法配置值、bearer、邮箱和长密钥
  不进入日志。

浏览器凭证存在 magpie 自己的 `plugin-auth.json`。CLI 凭证保留在
`~/.atomcode/auth.toml`，续期时以 `0600` 权限原子替换并保留无关内容。凭证不会
被打印或写入日志，只会附加到上面两个精确官方主机。

### 装完就在跑的默认行为

两个默认开关都是开的，且都会在没被要求的情况下动手：

| 默认 | 实际动作 | 关闭方式 |
|---|---|---|
| `autoClaim: true` | 登录后在后台启动 CodingPlan `claim-v2`；套餐到期时再执行幂等重领 | `magpie plugin options atomcode '{"autoClaim":false}'` |
| `autoVersion: true` | 后台刷新 `raw.atomgit.com` 的版本清单（缓存 12 小时）。请求立即使用当前缓存版本，拿不到时使用内置兜底 | `magpie plugin options atomcode '{"autoVersion":false}'` |

## 排障

登录或 `provider test` 遇到 401 时：

1. 运行 `magpie version`，确认失败阶段是 OAuth 回调、模型目录、额度还是真实对话请求。
2. 用同一账号运行官方 AtomCode 客户端的 `atomcode login`。若官方客户端也返回 401，更可能是上游账号风控，而不是插件。
3. 提交 Bug 时附上脱敏日志。不要提供 access token、refresh token、OAuth state、`plugin-auth.json`、邮箱、账号 ID 或未脱敏的用户目录。

安全问题请按 [SECURITY.md](SECURITY.md) 私密报告；开发与审查约定见仓库的 [CONTRIBUTING.md](https://github.com/aqiu817/magpie-atomcode/blob/main/CONTRIBUTING.md)。

## 开发

```bash
cd ../..
npm test                       # 在 workspace 根运行 Node 测试
npm run test:bun               # Bun 宿主/运行时测试
npm run test:coverage:enforce  # 行/分支/函数覆盖率门禁
npm run pack:check             # 检查 npm 发布包内容
```

真机验证会消耗少量额度，默认关闭：

```bash
ATOMCODE_LIVE=1 npm run test:live
```

脚本最多发出 9 次请求，关闭自动领取，不执行签到，也不会输出 token、提示词或
模型回复正文。

CI 会在 Node 20、22、24 与固定版本 Bun 上运行测试，执行覆盖率门禁，并把
打包后的 tarball 安装到空目录做导入冒烟。发布流程使用 npm trusted publishing
和 provenance，只由 GitHub Release 触发。

沙箱验证（不碰真实配置）：

```bash
SB=$(mktemp -d)
PLUGIN_ROOT="$(pwd)/packages/atomcode"
sb() { env HOME="$SB" USERPROFILE="$SB" XDG_CONFIG_HOME="$SB/.config" XDG_CACHE_HOME="$SB/.cache" \
  MAGPIE_ADDR=127.0.0.1:3499 MAGPIE_PLUGIN_MARKET=off magpie "$@"; }
sb plugin add "$PLUGIN_ROOT"
sb provider test atomcode
sb quota
```

同一份代码可加载为 OpenCode 插件（v1 插件形态）；magpie 自有的 `auth.usage` /
`auth.refresh` / `auth.checkin` 会被 OpenCode 忽略。由于 OpenCode 的 OAuth 类型
没有声明 AtomCode 签名必需的 `uid` 字段，OpenCode 支持仍标为实验性，需通过真实
宿主契约测试后再升级。

## 免责声明与署名

本插件是非官方的兼容实现，不隶属于 AtomGit / AtomCode，也未获其认可。上游协议（签名密钥、OAuth、接口）可能随时变化；使用方式可能违反服务条款，存在账号受限或封禁风险——Atom2Api 项目有同类警示。请仅凭自己的账号、在了解风险的前提下使用。实现依据与署名见 [NOTICE.md](NOTICE.md)。
