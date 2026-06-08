import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SparkChatConsole from '../SparkChatConsole.vue'

const { sendChatWorkbenchMessageMock } = vi.hoisted(() => ({
  sendChatWorkbenchMessageMock: vi.fn()
}))

vi.mock('@/api/chatWorkbench', () => ({
  sendChatWorkbenchMessage: sendChatWorkbenchMessageMock
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
})
