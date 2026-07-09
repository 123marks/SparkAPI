# Grok2API Provider Integration

SparkAPI supports Grok as an OpenAI-compatible provider through a local `grok2api` sidecar. The integration keeps Grok accounts in an isolated `grok` platform pool, so Grok accounts are never scheduled for normal OpenAI groups.

## Start the sidecar with Docker Compose

From `deploy/`:

```powershell
docker compose -f docker-compose.local.yml -f docker-compose.grok2api.yml --profile grok2api up -d
```

Default ports and URLs:

- Public sidecar API: `http://127.0.0.1:18000`
- Admin login: `http://127.0.0.1:18000/admin/login`
- SparkAPI account Base URL when SparkAPI runs in Docker and sidecar is exposed on the host: `http://host.docker.internal:18000`
- SparkAPI account Base URL when both services share the same compose network: `http://grok2api:8000`
- SparkAPI account Base URL when SparkAPI runs directly on Windows: `http://127.0.0.1:18000`

If you set `GROK2API_API_KEY`, use the same value as the Grok account API key in SparkAPI. If `grok2api` API auth is empty/disabled, SparkAPI still needs a placeholder API key value because the account type is API-key based.

## Add accounts

1. Open the grok2api admin page and add/maintain Grok accounts there.
2. In SparkAPI, create a group with platform `Grok`.
3. Add a SparkAPI account:
   - Platform: `Grok`
   - Type: `API Key`
   - Base URL: `http://host.docker.internal:18000` or `http://grok2api:8000`
   - API Key: grok2api API key or placeholder if auth is disabled
4. Bind the account to the Grok group and create an API key for that group.

## Supported model families

Text/chat examples:

- `grok-4.20-fast`
- `grok-4.20-auto`
- `grok-4.20-expert`
- `grok-4.3-beta`

Image/video examples:

- `grok-imagine-image-lite`
- `grok-imagine-image`
- `grok-imagine-image-pro`
- `grok-imagine-image-edit`
- `grok-imagine-video`

`GET /v1/models` returns the Grok catalog for Grok groups when no explicit account model mapping is configured.
