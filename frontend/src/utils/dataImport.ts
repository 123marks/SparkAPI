import type { AdminDataAccount, AdminDataPayload, AdminDataProxy } from '@/types'

type DataPayloadWrapper = {
  data?: unknown
}

const SUPPORTED_DATA_TYPES = new Set(['sub2api-data', 'sub2api-bundle'])
const SUPPORTED_DATA_VERSION = 1

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function assertAdminDataPayload(value: unknown, sourceName: string): AdminDataPayload {
  if (!isRecord(value)) {
    throw new Error(`${sourceName}: data must be a JSON object`)
  }

  const type = typeof value.type === 'string' ? value.type : ''
  if (type && !SUPPORTED_DATA_TYPES.has(type)) {
    throw new Error(`${sourceName}: unsupported data type ${type}`)
  }

  const version = typeof value.version === 'number' ? value.version : 0
  if (version && version !== SUPPORTED_DATA_VERSION) {
    throw new Error(`${sourceName}: unsupported data version ${version}`)
  }

  if (!Array.isArray(value.proxies)) {
    throw new Error(`${sourceName}: proxies must be an array`)
  }
  if (!Array.isArray(value.accounts)) {
    throw new Error(`${sourceName}: accounts must be an array`)
  }

  return {
    type: type || 'sub2api-data',
    version: version || SUPPORTED_DATA_VERSION,
    exported_at: typeof value.exported_at === 'string' ? value.exported_at : new Date().toISOString(),
    proxies: value.proxies as AdminDataProxy[],
    accounts: value.accounts as AdminDataAccount[]
  }
}

function unwrapAdminDataPayload(value: unknown, sourceName: string): AdminDataPayload {
  if (isRecord(value) && 'data' in value) {
    return assertAdminDataPayload((value as DataPayloadWrapper).data, sourceName)
  }
  return assertAdminDataPayload(value, sourceName)
}

export function parseAdminDataImportContent(content: string, sourceName = 'import.json'): AdminDataPayload[] {
  let value: unknown
  try {
    value = JSON.parse(content)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${sourceName}: invalid JSON (${message})`)
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => unwrapAdminDataPayload(item, `${sourceName}#${index + 1}`))
  }

  return [unwrapAdminDataPayload(value, sourceName)]
}

function proxyMergeKey(proxy: AdminDataProxy): string {
  if (typeof proxy.proxy_key === 'string' && proxy.proxy_key.trim()) {
    return proxy.proxy_key
  }
  return [
    String(proxy.protocol ?? '').trim(),
    String(proxy.host ?? '').trim(),
    Number(proxy.port ?? 0),
    String(proxy.username ?? '').trim(),
    String(proxy.password ?? '').trim()
  ].join('|')
}

export function mergeAdminDataPayloads(payloads: AdminDataPayload[]): AdminDataPayload {
  const proxies: AdminDataProxy[] = []
  const proxyKeys = new Set<string>()
  const accounts: AdminDataAccount[] = []

  for (const payload of payloads) {
    for (const proxy of payload.proxies || []) {
      const key = proxyMergeKey(proxy)
      if (proxyKeys.has(key)) {
        continue
      }
      proxyKeys.add(key)
      proxies.push(proxy)
    }
    accounts.push(...(payload.accounts || []))
  }

  return {
    type: 'sub2api-data',
    version: SUPPORTED_DATA_VERSION,
    exported_at: new Date().toISOString(),
    proxies,
    accounts
  }
}
