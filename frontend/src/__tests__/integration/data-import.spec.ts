import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ImportDataModal from '@/components/admin/account/ImportDataModal.vue'
import { adminAPI } from '@/api/admin'

const showError = vi.fn()
const showSuccess = vi.fn()

vi.mock('@/stores/app', () => ({
  useAppStore: () => ({
    showError,
    showSuccess
  })
}))

vi.mock('@/api/admin', () => ({
  adminAPI: {
    accounts: {
      importData: vi.fn()
    }
  }
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key
  })
}))

describe('ImportDataModal', () => {
  beforeEach(() => {
    showError.mockReset()
    showSuccess.mockReset()
    vi.mocked(adminAPI.accounts.importData).mockReset()
    vi.mocked(adminAPI.accounts.importData).mockResolvedValue({
      account_created: 0,
      account_failed: 0,
      proxy_created: 0,
      proxy_reused: 0,
      proxy_failed: 0
    })
  })

  it('未选择文件时提示错误', async () => {
    const wrapper = mount(ImportDataModal, {
      props: { show: true },
      global: {
        stubs: {
          BaseDialog: { template: '<div><slot /><slot name="footer" /></div>' }
        }
      }
    })

    await wrapper.find('form').trigger('submit')
    expect(showError).toHaveBeenCalledWith('admin.accounts.dataImportSelectFile')
  })

  it('无效 JSON 时提示解析失败', async () => {
    const wrapper = mount(ImportDataModal, {
      props: { show: true },
      global: {
        stubs: {
          BaseDialog: { template: '<div><slot /><slot name="footer" /></div>' }
        }
      }
    })

    const input = wrapper.find('input[type="file"]')
    const file = new File(['invalid json'], 'data.json', { type: 'application/json' })
    Object.defineProperty(file, 'text', {
      value: () => Promise.resolve('invalid json')
    })
    Object.defineProperty(input.element, 'files', {
      value: [file]
    })

    await input.trigger('change')
    await wrapper.find('form').trigger('submit')
    await Promise.resolve()

    expect(showError).toHaveBeenCalledWith('admin.accounts.dataImportParseFailed')
  })

  it('imports every selected JSON file instead of stopping at 20', async () => {
    const wrapper = mount(ImportDataModal, {
      props: { show: true },
      global: {
        stubs: {
          BaseDialog: { template: '<div><slot /><slot name="footer" /></div>' },
          GroupSelector: { template: '<div />' }
        }
      }
    })

    const files = Array.from({ length: 21 }, (_, index) => {
      const accountIndex = index + 1
      const content = JSON.stringify({
        type: 'sub2api-data',
        version: 1,
        exported_at: '2026-06-07T00:00:00Z',
        proxies: [],
        accounts: [
          {
            name: `account-${accountIndex}`,
            platform: 'openai',
            type: 'oauth',
            credentials: { access_token: `token-${accountIndex}` },
            concurrency: 1,
            priority: 50
          }
        ]
      })
      const file = new File([content], `account-${accountIndex}.json`, {
        type: 'application/json'
      })
      Object.defineProperty(file, 'text', {
        value: () => Promise.resolve(content)
      })
      return file
    })

    const input = wrapper.find('input[type="file"]')
    Object.defineProperty(input.element, 'files', {
      value: files
    })

    await input.trigger('change')
    await wrapper.find('form').trigger('submit')
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(adminAPI.accounts.importData).toHaveBeenCalledTimes(1)
    const [request] = vi.mocked(adminAPI.accounts.importData).mock.calls[0]
    expect(request.data.accounts).toHaveLength(21)
    expect(request.data.accounts.map((account) => account.name)).toContain('account-21')
  })
})
