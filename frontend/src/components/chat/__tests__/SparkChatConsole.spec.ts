import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SparkChatConsole from '../SparkChatConsole.vue'

const { accountsListMock, keysListMock, sendChatWorkbenchImageGenerationMock, sendChatWorkbenchMessageStreamMock } = vi.hoisted(() => ({
  accountsListMock: vi.fn(),
  keysListMock: vi.fn(),
  sendChatWorkbenchImageGenerationMock: vi.fn(),
  sendChatWorkbenchMessageStreamMock: vi.fn()
}))

vi.mock('@/api/chatWorkbench', () => ({
  sendChatWorkbenchImageGeneration: sendChatWorkbenchImageGenerationMock,
  sendChatWorkbenchMessageStream: sendChatWorkbenchMessageStreamMock
}))

vi.mock('@/api/keys', () => ({
  keysAPI: {
    list: keysListMock
  }
}))

vi.mock('@/api/admin/accounts', () => ({
  accountsAPI: {
    list: accountsListMock
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
    accountsListMock.mockReset()
    accountsListMock.mockResolvedValue({ items: [], total: 0, pages: 0 })
    keysListMock.mockReset()
    keysListMock.mockResolvedValue({ items: [], total: 0, pages: 0 })
    sendChatWorkbenchImageGenerationMock.mockReset()
    sendChatWorkbenchImageGenerationMock.mockResolvedValue({ images: [] })
    sendChatWorkbenchMessageStreamMock.mockReset()
    sendChatWorkbenchMessageStreamMock.mockResolvedValue({ content: 'ok' })
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

    expect(sendChatWorkbenchMessageStreamMock).toHaveBeenCalledTimes(1)
    const request = sendChatWorkbenchMessageStreamMock.mock.calls[0][0]
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

    expect(sendChatWorkbenchMessageStreamMock).toHaveBeenCalledWith(expect.objectContaining({
      baseUrl: 'https://gateway.example.com/v1/chat/completions'
    }), expect.any(Object))
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

    const request = sendChatWorkbenchMessageStreamMock.mock.calls[0][0]
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
    sendChatWorkbenchMessageStreamMock.mockRejectedValue(error)

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

    const request = sendChatWorkbenchMessageStreamMock.mock.calls[0][0]
    expect(request.messages[0].content).toContain('MCP connector catalog')
    expect(request.messages[0].content).toContain('Selected SparkAPI workbench tools')
  })

  it('adds a read-only account patrol snapshot when account patrol is selected', async () => {
    accountsListMock.mockResolvedValue({
      total: 3,
      pages: 1,
      items: [
        {
          id: 1,
          name: 'Claude A',
          platform: 'anthropic',
          type: 'oauth',
          status: 'active',
          schedulable: true,
          error_message: null,
          proxy_id: 9,
          group_ids: [2],
          groups: [{ id: 2, name: 'VIP' }],
          rate_limited_at: null,
          rate_limit_reset_at: null,
          overload_until: null,
          temp_unschedulable_until: null,
          last_used_at: '2026-06-10T07:00:00Z',
          created_at: '2026-06-01T00:00:00Z',
          updated_at: '2026-06-10T07:00:00Z'
        },
        {
          id: 2,
          name: 'OpenAI bad proxy',
          platform: 'openai',
          type: 'apikey',
          status: 'error',
          schedulable: false,
          error_message: 'proxy connect failed',
          proxy_id: 10,
          group_ids: [3],
          groups: [{ id: 3, name: 'Image' }],
          rate_limited_at: null,
          rate_limit_reset_at: null,
          overload_until: null,
          temp_unschedulable_until: null,
          last_used_at: null,
          created_at: '2026-06-02T00:00:00Z',
          updated_at: '2026-06-10T08:00:00Z'
        },
        {
          id: 3,
          name: 'Kiro limited',
          platform: 'kiro',
          type: 'oauth',
          status: 'active',
          schedulable: false,
          error_message: null,
          proxy_id: null,
          group_ids: [2],
          groups: [{ id: 2, name: 'VIP' }],
          rate_limited_at: '2026-06-10T08:00:00Z',
          rate_limit_reset_at: '2026-06-10T09:00:00Z',
          overload_until: null,
          temp_unschedulable_until: null,
          last_used_at: '2026-06-10T08:05:00Z',
          created_at: '2026-06-03T00:00:00Z',
          updated_at: '2026-06-10T08:05:00Z'
        }
      ]
    })

    const wrapper = mount(SparkChatConsole, {
      props: {
        storageKey: 'account_patrol_chat_console'
      },
      global: {
        plugins: [createPinia()],
        stubs: {
          Icon: true
        }
      }
    })

    await wrapper.get('[data-test="tool-search-input"]').setValue('account')
    await wrapper.get('[data-test="tool-toggle-account-patrol"]').trigger('click')
    await wrapper.get('input[type="password"]').setValue('sk-patrol')
    await wrapper.findAll('textarea').at(-1)!.setValue('巡检账号池')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(accountsListMock).toHaveBeenCalledWith(1, 500, expect.objectContaining({
      sort_by: 'updated_at',
      sort_order: 'desc',
      lite: 'true'
    }), expect.any(Object))
    const request = sendChatWorkbenchMessageStreamMock.mock.calls[0][0]
    expect(request.messages[0].content).toContain('SparkAPI account patrol snapshot')
    expect(request.messages[0].content).toContain('Total accounts: 3')
    expect(request.messages[0].content).toContain('error=1')
    expect(request.messages[0].content).toContain('Group VIP')
    expect(request.messages[0].content).toContain('Proxy #10')
    expect(request.messages[0].content).toContain('proxy connect failed')
  })

  it('shows an assistant placeholder while the gateway stream is still connecting', async () => {
    let resolveStream!: (value: { content: string }) => void
    sendChatWorkbenchMessageStreamMock.mockReturnValue(new Promise((resolve) => {
      resolveStream = resolve
    }))

    const wrapper = mount(SparkChatConsole, {
      props: {
        storageKey: 'pending_chat_console'
      },
      global: {
        plugins: [createPinia()],
        stubs: {
          Icon: true
        }
      }
    })

    await wrapper.get('input[type="password"]').setValue('sk-pending')
    await wrapper.findAll('textarea').at(-1)!.setValue('hello')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('chatConsole.streamStatus.connecting')
    expect(wrapper.text()).toContain('chatConsole.assistant')

    resolveStream({ content: 'done' })
    await flushPromises()
  })

  it('updates the assistant response as streamed deltas arrive', async () => {
    sendChatWorkbenchMessageStreamMock.mockImplementation(async (_request, handlers) => {
      handlers.onDelta('Hello ')
      await Promise.resolve()
      handlers.onDelta('world')
      return { content: 'Hello world' }
    })

    const wrapper = mount(SparkChatConsole, {
      props: {
        storageKey: 'stream_chat_console'
      },
      global: {
        plugins: [createPinia()],
        stubs: {
          Icon: true
        }
      }
    })

    await wrapper.get('input[type="password"]').setValue('sk-stream')
    await wrapper.findAll('textarea').at(-1)!.setValue('hello')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('Hello world')
    expect(wrapper.text()).not.toContain('chatConsole.streamStatus.connecting')
  })

  it('sends the current user prompt only once', async () => {
    const wrapper = mount(SparkChatConsole, {
      props: {
        storageKey: 'no_duplicate_prompt_chat_console'
      },
      global: {
        plugins: [createPinia()],
        stubs: {
          Icon: true
        }
      }
    })

    await wrapper.get('input[type="password"]').setValue('sk-no-duplicate')
    await wrapper.findAll('textarea').at(-1)!.setValue('diagnose gateway 502')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    const request = sendChatWorkbenchMessageStreamMock.mock.calls[0][0]
    const userPrompts = request.messages.filter((message: any) => message.role === 'user' && message.content === 'diagnose gateway 502')
    expect(userPrompts).toHaveLength(1)
    expect(request.messages.at(-1)).toEqual({ role: 'user', content: 'diagnose gateway 502' })
  })

  it('passes configurable image generation settings to the image endpoint', async () => {
    const wrapper = mount(SparkChatConsole, {
      props: {
        storageKey: 'image_settings_chat_console'
      },
      global: {
        plugins: [createPinia()],
        stubs: {
          Icon: true
        }
      }
    })

    await wrapper.get('[data-test="run-type-image"]').trigger('click')
    await wrapper.get('[data-test="image-model-input"]').setValue('gpt-image-1')
    await wrapper.get('[data-test="image-size-select"]').setValue('1536x1024')
    await wrapper.get('[data-test="image-quality-select"]').setValue('high')
    await wrapper.get('[data-test="image-count-input"]').setValue(3)
    await wrapper.get('input[type="password"]').setValue('sk-image')
    await wrapper.findAll('textarea').at(-1)!.setValue('draw a clean operations dashboard')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(sendChatWorkbenchImageGenerationMock).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gpt-image-1',
      size: '1536x1024',
      quality: 'high',
      n: 3
    }))
  })

  it('renders assistant Markdown without exposing raw emphasis markers', async () => {
    sendChatWorkbenchMessageStreamMock.mockResolvedValue({
      content: '**重点**\n\n- 账号异常'
    })

    const wrapper = mount(SparkChatConsole, {
      props: {
        storageKey: 'markdown_chat_console'
      },
      global: {
        plugins: [createPinia()],
        stubs: {
          Icon: true
        }
      }
    })

    await wrapper.get('input[type="password"]').setValue('sk-markdown')
    await wrapper.findAll('textarea').at(-1)!.setValue('summarize')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    const assistantHtml = wrapper.html()
    expect(assistantHtml).toContain('<strong>重点</strong>')
    expect(assistantHtml).toContain('<li>账号异常</li>')
    expect(wrapper.text()).not.toContain('**重点**')
  })
})
