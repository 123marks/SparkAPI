# Kiro-RS Sidecar 联动说明

Kiro-RS 是一个独立的 Anthropic Claude API 兼容代理。SparkAPI 已有 Anthropic API Key passthrough 能力，所以推荐把 Kiro-RS 作为同一 Docker 网络里的 sidecar 运行，再在 SparkAPI 后台添加一个 Anthropic API Key 账号指向它。

## 目录

```text
deploy/
  docker-compose.local.yml
  docker-compose.kiro-rs.yml
  kiro-rs/
    config/
      config.example.json
      credentials.example.json
      config.json        # 本地创建，包含 Kiro-RS API Key，不提交
      credentials.json   # 本地创建，包含 Kiro refresh token，不提交
    sparkapi-anthropic-account.example.json
```

## 准备配置

在 `deploy/` 目录执行：

```bash
cp kiro-rs/config/config.example.json kiro-rs/config/config.json
cp kiro-rs/config/credentials.example.json kiro-rs/config/credentials.json
```

Windows PowerShell：

```powershell
Copy-Item .\kiro-rs\config\config.example.json .\kiro-rs\config\config.json
Copy-Item .\kiro-rs\config\credentials.example.json .\kiro-rs\config\credentials.json
```

然后编辑：

- `kiro-rs/config/config.json`
  - `host` 必须保持 `0.0.0.0`，否则 SparkAPI 容器访问不到 Kiro-RS。
  - `apiKey` 改成强随机值。
  - `adminApiKey` 改成强随机值，或删除该字段关闭 Kiro-RS 管理面板。
- `kiro-rs/config/credentials.json`
  - 填入 Kiro refresh token。
  - 多账号时使用数组格式，并用 `priority` 控制优先级。
  - 需要代理时优先写到具体 credential 的 `proxyUrl`，避免所有账号共用一个出口。

真实 `config.json`、`credentials.json` 已被 `.gitignore` 忽略，不要提交。

## 启动

本地目录部署：

```bash
docker compose -f docker-compose.local.yml -f docker-compose.kiro-rs.yml --profile kiro-rs up -d
```

Windows PowerShell：

```powershell
powershell -ExecutionPolicy Bypass -File .\start-kiro-rs-sidecar.ps1
```

如果你要二开 Kiro-RS 本体，并从本地源码构建：

```bash
docker compose -f docker-compose.local.yml -f docker-compose.kiro-rs.yml -f docker-compose.kiro-rs.local-src.yml --profile kiro-rs up -d --build
```

默认本地源码路径按 `C:\Users\whw\Desktop\CLIProxyAPI\kiro.rs-2026.3.1` 设计。路径不一致时，在 `.env` 里设置：

```env
KIRO_RS_SOURCE_DIR=/path/to/kiro.rs-2026.3.1
```

命名卷部署：

```bash
docker compose -f docker-compose.yml -f docker-compose.kiro-rs.yml --profile kiro-rs up -d
```

查看日志：

```bash
docker compose -f docker-compose.local.yml -f docker-compose.kiro-rs.yml --profile kiro-rs logs -f kiro-rs
```

默认宿主机只暴露 `127.0.0.1:8990`。如果你要让外部访问 Kiro-RS，显式设置 `KIRO_RS_BIND_HOST=0.0.0.0`，并务必用防火墙或反向代理鉴权保护。

## 在 SparkAPI 后台添加账号

后台添加账号：

- 平台：`Anthropic`
- 类型：`API Key`
- Base URL：`http://kiro-rs:8990`
- API Key：填写 `kiro-rs/config/config.json` 里的 `apiKey`
- 开启 Anthropic passthrough
- 按需要配置模型映射，例如 `claude-sonnet-4-6 -> claude-sonnet-4-6`

参考文件：`deploy/kiro-rs/sparkapi-anthropic-account.example.json`。

如果你启用了 URL allowlist，需要允许内部 HTTP/private host，或把 `kiro-rs` 加入上游 host 白名单。

## 验证

宿主机验证 Kiro-RS：

```bash
curl http://127.0.0.1:8990/v1/models \
  -H "x-api-key: sk-kiro-rs-change-me"
```

容器网络验证：

```bash
docker compose -f docker-compose.local.yml -f docker-compose.kiro-rs.yml --profile kiro-rs exec sub2api wget -q -O - http://kiro-rs:8990/v1/models --header="x-api-key: sk-kiro-rs-change-me"
```

SparkAPI 账号测试成功后，请通过 SparkAPI 的统一 API 入口调用 Claude 模型，而不是让业务客户端直接打 Kiro-RS。这样用量统计、分组、限流和账号调度仍然由 SparkAPI 管理。

## 常见问题

- SparkAPI 里 base URL 不要写 `http://127.0.0.1:8990`，容器内的 `127.0.0.1` 指向 SparkAPI 自己。应写 `http://kiro-rs:8990`。
- Kiro-RS 配置里的 `host` 不要写 `127.0.0.1`，容器外无法访问。应写 `0.0.0.0`。
- 代理在容器里不能写宿主机 `127.0.0.1:7890`。如需访问宿主机代理，使用 `host.docker.internal:7890`。
- `apiKey`、`adminApiKey`、refresh token 都是敏感信息，不要放进仓库。
