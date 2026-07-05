# Kiro-RS Sidecar 联动说明

Kiro-RS 是独立的 Anthropic Claude 兼容代理，并且这个版本自带 `/admin` Web 管理面板。正确方式不是每次复制配置，也不是在 SparkAPI 里逐个维护 Kiro refresh token，而是：

1. Kiro-RS 在 Docker 里作为 sidecar 常驻运行。
2. 打开 `http://127.0.0.1:8990/admin`，在 Kiro-RS 面板里添加/删除/禁用 Kiro 账号。
3. `deploy/kiro-rs/config` 通过 volume 挂载到容器内，账号配置会持久化。
4. SparkAPI 后台添加一个 Anthropic API Key 上游，Base URL 指向 `http://kiro-rs:8990`。
5. 之后统一从 SparkAPI 调 Claude 模型；Kiro 账号池由 Kiro-RS 管，SparkAPI 负责中转站侧的分组、限流、统计、渠道定价和用户侧 API。

## 目录

```text
deploy/
  docker-compose.local.yml
  docker-compose.kiro-rs.yml
  start-kiro-rs-sidecar.ps1
  kiro-rs/
    config/
      config.example.json
      credentials.example.json
      config.json        # 首次启动自动创建，包含 Kiro-RS API Key，不提交
      credentials.json   # 首次启动自动创建为空数组，后续由 Kiro-RS /admin 管理，不提交
    sparkapi-anthropic-account.example.json
```

真实的 `config.json` 和 `credentials.json` 已被 `.gitignore` 忽略，里面有密钥和 refresh token，不要提交到 GitHub。

## 首次配置

进入 `deploy` 目录：

```powershell
cd C:\Users\whw\Desktop\Sub2Api\sub2api\deploy
```

首次运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\start-kiro-rs-sidecar.ps1
```

脚本会自动创建缺失的：

- `kiro-rs/config/config.json`
- `kiro-rs/config/credentials.json`

并且会自动把 `config.json` 里的默认 `apiKey` / `adminApiKey` 换成随机密钥。如果没有 `credentials.json`，脚本会创建一个空数组 `[]`，让 Kiro-RS 可以先启动管理面板。

后续重启不要再复制 example 文件，直接运行启动命令即可。除非你手动删除了 `config.json` 或 `credentials.json`，否则脚本不会覆盖你已经填好的配置。

## Kiro-RS 管理面板

启动后打开：

```text
http://127.0.0.1:8990/admin
```

登录密钥填：

```text
deploy/kiro-rs/config/config.json 里的 adminApiKey
```

在这个页面里添加 Kiro 账号、批量导入、禁用账号、调整优先级、查看余额。也就是说，Kiro refresh token 应优先通过 Kiro-RS 前端管理，而不是每次手工复制 JSON。

如果你想强制脚本在“至少已有一个真实 Kiro 账号”时才允许启动，可以加：

```powershell
powershell -ExecutionPolicy Bypass -File .\start-kiro-rs-sidecar.ps1 -RequireCredentials
```

## credentials.json 格式

正常情况下你不用手工编辑这个文件，直接在 Kiro-RS `/admin` 添加账号即可。下面格式只用于排查或离线导入。

普通 Kiro 社交登录账号：

```json
[
  {
    "refreshToken": "你的完整 Kiro refresh token",
    "expiresAt": "2026-12-31T00:00:00Z",
    "authMethod": "social",
    "machineId": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "priority": 0
  }
]
```

IDC / External IdP 账号需要额外填写：

```json
[
  {
    "refreshToken": "你的完整 Kiro IDC refresh token",
    "expiresAt": "2026-12-31T00:00:00Z",
    "authMethod": "idc",
    "clientId": "你的 IDC client id",
    "clientSecret": "你的 IDC client secret",
    "region": "us-east-1",
    "machineId": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "priority": 10
  }
]
```

多账号可以保留数组格式，通过 `priority` 控制优先级。临时不用的账号可以加：

```json
"disabled": true
```

启动脚本只校验启用中的真实账号。缺少账号时仍允许启动 `/admin`；旧示例里残留的占位符会被自动禁用，避免挡住管理面板。

如需给某个 Kiro 账号单独设置代理，优先写在对应 credential 的 `proxyUrl`，例如：

```json
"proxyUrl": "http://host.docker.internal:7890"
```

容器里不要写宿主机的 `127.0.0.1:7890`，应使用 `host.docker.internal:7890`。

## 启动命令

本地 Docker 部署 SparkAPI + Kiro-RS：

```powershell
cd C:\Users\whw\Desktop\Sub2Api\sub2api\deploy
powershell -ExecutionPolicy Bypass -File .\start-kiro-rs-sidecar.ps1
```

只启动 Kiro-RS，不启动 SparkAPI：

```powershell
powershell -ExecutionPolicy Bypass -File .\start-kiro-rs-sidecar.ps1 -NoStartSparkAPI
```

拉取最新 Kiro-RS 镜像后启动：

```powershell
powershell -ExecutionPolicy Bypass -File .\start-kiro-rs-sidecar.ps1 -Pull
```

如果你要二开 Kiro-RS 本体，并从本地源码构建：

```powershell
powershell -ExecutionPolicy Bypass -File .\start-kiro-rs-sidecar.ps1 -BuildLocal
```

默认本地源码路径按 `C:\Users\whw\Desktop\CLIProxyAPI\kiro.rs-2026.3.1` 设计。路径不同的话，在 `deploy/.env` 里设置：

```env
KIRO_RS_SOURCE_DIR=C:\你的\kiro-rs\源码路径
```

## 在 SparkAPI 后台添加账号

Kiro 账号添加到 Kiro-RS `/admin` 后，再在 SparkAPI 后台添加一个上游账号：

- 平台：`Anthropic`
- 类型：`API Key`
- Base URL：`http://kiro-rs:8990`
- API Key：填写 `deploy/kiro-rs/config/config.json` 里的 `apiKey`
- 开启 Anthropic passthrough
- 按需要配置 Claude 模型映射，例如 `claude-sonnet-4-6 -> claude-sonnet-4-6`

可参考：

```text
deploy/kiro-rs/sparkapi-anthropic-account.example.json
```

这个账号代表“整个 Kiro-RS 账号池”，不是某一个 Kiro 账号。Kiro-RS 负责在它内部的 Kiro 账号之间调度，SparkAPI 只把 Kiro-RS 当成一个 Anthropic-compatible 上游。

## 验证

宿主机验证 Kiro-RS：

```powershell
curl.exe http://127.0.0.1:8990/v1/models -H "x-api-key: 你的 config.json apiKey"
```

容器网络验证 SparkAPI 能访问 Kiro-RS：

```powershell
docker compose -f docker-compose.local.yml -f docker-compose.kiro-rs.yml --profile kiro-rs exec sub2api wget -q -O - http://kiro-rs:8990/v1/models --header="x-api-key: 你的 config.json apiKey"
```

注意：SparkAPI 账号里的 Base URL 不要写 `http://127.0.0.1:8990`。在 SparkAPI 容器内，`127.0.0.1` 指向 SparkAPI 自己，应写 `http://kiro-rs:8990`。

## 安全注意

- 默认只把 Kiro-RS 暴露到宿主机 `127.0.0.1:8990`。
- 只有在可信主机上才设置 `KIRO_RS_BIND_HOST=0.0.0.0`。
- `apiKey`、`adminApiKey`、refresh token、client secret 都是敏感信息，不要提交仓库，不要截图发给别人。
- 上游 sub2api 更新不能直接盲合并。当前 SparkAPI 有大量本地二开，建议只挑选 Kiro、计费、导入去重、并发清理等明确有价值的提交逐个移植。
