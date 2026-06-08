import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendChatWorkbenchMessage } from '../chatWorkbench'

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
})
