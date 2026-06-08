import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SparkChatConsole from '../SparkChatConsole.vue'

const { keysListMock, sendChatWorkbenchMessageMock } = vi.hoisted(() => ({
  keysListMock: vi.fn(),
  sendChatWorkbenchMessageMock: vi.fn()
}))

vi.mock('@/api/chatWorkbench', () => ({
  sendChatWorkbenchMessage: sendChatWorkbenchMessageMock
}))

vi.mock('@/api/keys', () => ({
  keysAPI: {
    list: keysListMock
  }
}))

vi.mock('vue-i18n', async () => {
  const actual = await vi.importActual<typeof import('vue-i18n')>('vue-i18n')
  return {
    ...actual,
    useI18n: () => ({
      t: (key: string, params?: Record<string, unknown>) => {
        if (key === 'chatConsole.defaultFileQuestion') return 'Analyze the attached files.'
        if (params) return `${key} ${JSON.stringify(params)}`
        return key
      }
    })
  }
})

describe('SparkChatConsole', () => {
  beforeEach(() => {
    keysListMock.mockReset()
    keysListMock.mockResolvedValue({ items: [], total: 0, pages: 0 })
    sendChatWorkbenchMessageMock.mockReset()
    sendChatWorkbenchMessageMock.mockResolvedValue({ content: 'ok' })
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  it('sends the default context once in the system prompt', async () => {
    const defaultContext = 'DEFAULT_CONTEXT_MARKER'
    const wrapper = mount(SparkChatConsole, {
      props: {
        defaultContext,
        storageKey: 'test_chat_console'
      },
      global: {
        plugins: [createPinia()],
        stubs: {
          Icon: true
        }
      }
    })

    await wrapper.get('input[type="password"]').setValue('sk-test')
    await wrapper.findAll('textarea').at(-1)!.setValue('hello')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(sendChatWorkbenchMessageMock).toHaveBeenCalledTimes(1)
    const request = sendChatWorkbenchMessageMock.mock.calls[0][0]
    const systemPrompt = request.messages[0].content
    expect(systemPrompt.match(new RegExp(defaultContext, 'g'))).toHaveLength(1)
  })

  it('persists a sent conversation in local history', async () => {
    const wrapper = mount(SparkChatConsole, {
      props: {
        storageKey: 'history_chat_console'
      },
      global: {
        plugins: [createPinia()],
        stubs: {
          Icon: true
        }
      }
    })

    await wrapper.get('input[type="password"]').setValue('sk-history')
    await wrapper.findAll('textarea').at(-1)!.setValue('keep this conversation')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    const rawHistory = window.localStorage.getItem('history_chat_console_sessions')
    expect(rawHistory).toBeTruthy()
    const sessions = JSON.parse(rawHistory!)
    expect(sessions).toHaveLength(1)
    expect(sessions[0].messages).toEqual([
      expect.objectContaining({ role: 'user', content: 'keep this conversation' }),
      expect.objectContaining({ role: 'assistant', content: 'ok' })
    ])
  })

  it('can fill the gateway key from a saved project API key', async () => {
    keysListMock.mockResolvedValue({
      items: [
        {
          id: 7,
          key: 'sk-saved-project-key',
          name: 'Default project key',
          status: 'active',
          group: { name: 'Claude pool' }
        }
      ],
      total: 1,
      pages: 1
    })

    const wrapper = mount(SparkChatConsole, {
      props: {
        storageKey: 'saved_key_chat_console'
      },
      global: {
        plugins: [createPinia()],
        stubs: {
          Icon: true
        }
      }
    })
    await flushPromises()

    const savedKeySelect = wrapper.get('[data-test="saved-api-key-select"]')
    await savedKeySelect.setValue('7')

    expect((wrapper.get('input[type="password"]').element as HTMLInputElement).value).toBe('sk-saved-project-key')
  })

  it('sends through the configured request URL from the console form', async () => {
    const wrapper = mount(SparkChatConsole, {
      props: {
        storageKey: 'request_url_chat_console'
      },
      global: {
        plugins: [createPinia()],
        stubs: {
          Icon: true
        }
      }
    })

    await wrapper.get('[data-test="request-url-input"]').setValue('https://gateway.example.com/v1/chat/completions')
    await wrapper.get('input[type="password"]').setValue('sk-custom-url')
    await wrapper.findAll('textarea').at(-1)!.setValue('hello')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(sendChatWorkbenchMessageMock).toHaveBeenCalledWith(expect.objectContaining({
      baseUrl: 'https://gateway.example.com/v1/chat/completions'
    }))
  })

  it('keeps the normal key hint when saved keys are unavailable because the user is not logged in', async () => {
    keysListMock.mockRejectedValue({ status: 403 })

    const wrapper = mount(SparkChatConsole, {
      props: {
        storageKey: 'public_chat_console'
      },
      global: {
        plugins: [createPinia()],
        stubs: {
          Icon: true
        }
      }
    })
    await flushPromises()

    expect(wrapper.text()).toContain('chatConsole.apiKeyHint')
    expect(wrapper.text()).not.toContain('chatConsole.savedKeysUnavailable')
  })
})
