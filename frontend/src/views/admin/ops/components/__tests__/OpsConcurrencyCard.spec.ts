import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OpsConcurrencyCard from '../OpsConcurrencyCard.vue'

const { getConcurrencyStatsMock, getAccountAvailabilityStatsMock, getUserConcurrencyStatsMock } = vi.hoisted(() => ({
  getConcurrencyStatsMock: vi.fn(),
  getAccountAvailabilityStatsMock: vi.fn(),
  getUserConcurrencyStatsMock: vi.fn()
}))

vi.mock('@/api/admin/ops', () => ({
  opsAPI: {
    getConcurrencyStats: getConcurrencyStatsMock,
    getAccountAvailabilityStats: getAccountAvailabilityStatsMock,
    getUserConcurrencyStats: getUserConcurrencyStatsMock
  }
}))

vi.mock('vue-i18n', async () => {
  const actual = await vi.importActual<typeof import('vue-i18n')>('vue-i18n')
  return {
    ...actual,
    useI18n: () => ({
      t: (key: string, params?: Record<string, unknown>) => {
        if (params) return `${key} ${JSON.stringify(params)}`
        return key
      }
    })
  }
})

const concurrencyResponse = {
  enabled: true,
  platform: {
    openai: {
      platform: 'openai',
      current_in_use: 3,
      max_capacity: 10,
      load_percentage: 30,
      waiting_in_queue: 0
    }
  },
  group: {},
  account: {},
  timestamp: '2026-06-09T00:00:00Z'
}

const availabilityResponse = {
  enabled: true,
  platform: {},
  group: {},
  account: {},
  timestamp: '2026-06-09T00:00:00Z'
}

describe('OpsConcurrencyCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getConcurrencyStatsMock.mockResolvedValue(concurrencyResponse)
    getAccountAvailabilityStatsMock.mockResolvedValue(availabilityResponse)
    getUserConcurrencyStatsMock.mockResolvedValue({ enabled: true, user: {} })
  })

  it('keeps concurrency data visible when account availability loading fails', async () => {
    getAccountAvailabilityStatsMock.mockRejectedValue(new Error('statement canceled'))
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const wrapper = mount(OpsConcurrencyCard, {
      props: {
        refreshToken: 0
      }
    })
    await flushPromises()

    expect(wrapper.text()).toContain('OPENAI')
    expect(wrapper.text()).toContain('3/10')
    expect(wrapper.text()).toContain('admin.ops.concurrency.availabilityPartialFailed')
    expect(wrapper.text()).not.toContain('admin.ops.concurrency.loadFailed')
    expect(consoleErrorSpy).not.toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })
})
