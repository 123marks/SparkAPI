import { describe, expect, it } from 'vitest'
import {
  ADMIN_DATA_IMPORT_MAX_SINGLE_FILE_BYTES,
  ADMIN_DATA_IMPORT_MAX_TOTAL_BYTES,
  formatBytes,
  getAdminDataImportFileValidation,
  mergeAdminDataPayloads,
  parseAdminDataImportContent
} from '@/utils/dataImport'
import type { AdminDataPayload } from '@/types'

function payload(partial: Partial<AdminDataPayload>): AdminDataPayload {
  return {
    type: 'sub2api-data',
    version: 1,
    exported_at: '2026-05-23T00:00:00Z',
    proxies: [],
    accounts: [],
    ...partial
  }
}

describe('dataImport utilities', () => {
  it('merges multiple exported payloads and de-duplicates proxy definitions', () => {
    const first = payload({
      proxies: [
        {
          proxy_key: 'http|proxy.example|8080|user|pass',
          name: 'proxy-a',
          protocol: 'http',
          host: 'proxy.example',
          port: 8080,
          username: 'user',
          password: 'pass',
          status: 'active'
        }
      ],
      accounts: [
        {
          name: 'account-a',
          platform: 'openai',
          type: 'oauth',
          credentials: { access_token: 'a' },
          concurrency: 3,
          priority: 50,
          proxy_key: 'http|proxy.example|8080|user|pass'
        }
      ]
    })
    const second = payload({
      proxies: [
        {
          proxy_key: 'http|proxy.example|8080|user|pass',
          name: 'proxy-a-duplicate',
          protocol: 'http',
          host: 'proxy.example',
          port: 8080,
          username: 'user',
          password: 'pass',
          status: 'inactive'
        }
      ],
      accounts: [
        {
          name: 'account-b',
          platform: 'openai',
          type: 'oauth',
          credentials: { access_token: 'b' },
          concurrency: 3,
          priority: 50,
          proxy_key: 'http|proxy.example|8080|user|pass'
        }
      ]
    })

    const merged = mergeAdminDataPayloads([first, second])

    expect(merged.proxies).toHaveLength(1)
    expect(merged.proxies[0].name).toBe('proxy-a')
    expect(merged.accounts.map((account) => account.name)).toEqual(['account-a', 'account-b'])
  })

  it('parses plain payloads, wrapped payloads, and arrays from one file', () => {
    const first = payload({ accounts: [] })
    const second = payload({ accounts: [] })

    expect(parseAdminDataImportContent(JSON.stringify(first), 'plain.json')).toEqual([first])
    expect(parseAdminDataImportContent(JSON.stringify({ data: first }), 'wrapped.json')).toEqual([first])
    expect(parseAdminDataImportContent(JSON.stringify([first, { data: second }]), 'array.json')).toEqual([first, second])
  })

  it('rejects unsupported data shapes with the file name in the error', () => {
    expect(() => parseAdminDataImportContent(JSON.stringify({ accounts: [] }), 'bad.json')).toThrow(
      'bad.json'
    )
  })

  it('allows many small import files and validates size limits before reading files', () => {
    expect(
      getAdminDataImportFileValidation(
        Array.from({ length: 21 }, (_, index) => ({
          name: `backup-${index}.json`,
          size: 1
        }))
      )
    ).toMatchObject({ valid: true })

    expect(
      getAdminDataImportFileValidation([
        { name: 'large.json', size: ADMIN_DATA_IMPORT_MAX_SINGLE_FILE_BYTES + 1 }
      ])
    ).toMatchObject({ valid: false, reason: 'file_too_large', fileName: 'large.json' })

    expect(
      getAdminDataImportFileValidation([
        { name: 'a.json', size: 20 * 1024 * 1024 },
        { name: 'b.json', size: 20 * 1024 * 1024 },
        { name: 'c.json', size: 20 * 1024 * 1024 }
      ])
    ).toMatchObject({ valid: false, reason: 'total_too_large' })
  })

  it('formats file sizes for import feedback', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(10 * 1024)).toBe('10 KB')
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB')
  })
})
