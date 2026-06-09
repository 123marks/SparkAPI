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

  it('adds dropped text files to the request context', async () => {
    const wrapper = mount(SparkChatConsole, {
      props: {
        storageKey: 'drop_file_chat_console'
      },
      global: {
        plugins: [createPinia()],
        stubs: {
          Icon: true
        }
      }
    })
    const file = new File(['proxy=127.0.0.1:7890'], 'proxy-config.txt', { type: 'text/plain' })
    Object.defineProperty(file, 'text', {
      value: vi.fn().mockResolvedValue('proxy=127.0.0.1:7890')
    })

    await wrapper.trigger('drop', {
      dataTransfer: {
        files: [file]
      }
    })
    await flushPromises()

    await wrapper.get('input[type="password"]').setValue('sk-drop')
    await wrapper.findAll('textarea').at(-1)!.setValue('check attached file')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    const request = sendChatWorkbenchMessageMock.mock.calls[0][0]
    expect(request.messages[0].content).toContain('File 1: proxy-config.txt')
    expect(request.messages[0].content).toContain('proxy=127.0.0.1:7890')
  })

  it('renders upstream gateway failures in the conversation stream', async () => {
    const error = new Error('upstream request failed: connect: connection refused') as Error & {
      status: number
      endpoint: string
      model: string
      upstreamMessage: string
    }
    error.name = 'ChatWorkbenchError'
    error.status = 502
    error.endpoint = '/v1/chat/completions'
    error.model = 'gpt-5.5'
    error.upstreamMessage = 'upstream request failed: connect: connection refused'
    sendChatWorkbenchMessageMock.mockRejectedValue(error)

    const wrapper = mount(SparkChatConsole, {
      props: {
        storageKey: 'gateway_error_chat_console'
      },
      global: {
        plugins: [createPinia()],
        stubs: {
          Icon: true
        }
      }
    })

    await wrapper.get('input[type="password"]').setValue('sk-error')
    await wrapper.findAll('textarea').at(-1)!.setValue('hello')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('/v1/chat/completions')
    expect(wrapper.text()).toContain('gpt-5.5')
    expect(wrapper.text()).toContain('connection refused')
    expect(wrapper.text()).toContain('chatConsole.gatewayErrorAdvice')
  })

  it('adds selected tool capabilities to the system prompt', async () => {
    const wrapper = mount(SparkChatConsole, {
      props: {
        storageKey: 'tool_context_chat_console'
      },
      global: {
        plugins: [createPinia()],
        stubs: {
          Icon: true
        }
      }
    })

    await wrapper.get('[data-test="tool-search-input"]').setValue('mcp')
    await wrapper.get('[data-test="tool-toggle-mcp-catalog"]').trigger('click')
    await wrapper.get('input[type="password"]').setValue('sk-tool')
    await wrapper.findAll('textarea').at(-1)!.setValue('how should I use tools?')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    const request = sendChatWorkbenchMessageMock.mock.calls[0][0]
    expect(request.messages[0].content).toContain('MCP connector catalog')
    expect(request.messages[0].content).toContain('Selected SparkAPI workbench tools')
  })
})
