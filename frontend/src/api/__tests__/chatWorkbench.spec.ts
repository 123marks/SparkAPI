import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatWorkbenchError, sendChatWorkbenchMessage } from '../chatWorkbench'

describe('sendChatWorkbenchMessage', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('posts to the configured OpenAI-compatible request URL', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        choices: [{ message: { content: 'pong' } }],
        model: 'gpt-test'
      })
    } as any)

    await sendChatWorkbenchMessage({
      apiKey: 'sk-test',
      baseUrl: 'https://gateway.example.com/custom/v1/chat/completions',
      model: 'gpt-test',
      messages: [{ role: 'user', content: 'ping' }]
    })

    expect(global.fetch).toHaveBeenCalledWith(
      'https://gateway.example.com/custom/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-test'
        })
      })
    )
  })

  it('throws a structured upstream diagnostic for gateway 502 failures', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: vi.fn().mockResolvedValue({
        error: {
          message: 'upstream request failed: connect: connection refused'
        }
      })
    } as any)

    await expect(sendChatWorkbenchMessage({
      apiKey: 'sk-test',
      baseUrl: '/v1/chat/completions',
      model: 'gpt-5.5',
      messages: [{ role: 'user', content: 'ping' }]
    })).rejects.toMatchObject({
      name: 'ChatWorkbenchError',
      status: 502,
      endpoint: '/v1/chat/completions',
      model: 'gpt-5.5',
      upstreamMessage: 'upstream request failed: connect: connection refused'
    } satisfies Partial<ChatWorkbenchError>)
  })
})
