import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ChatWorkbenchError,
  sendChatWorkbenchImageGeneration,
  sendChatWorkbenchMessage,
  sendChatWorkbenchMessageStream
} from '../chatWorkbench'

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

  it('streams OpenAI-compatible assistant deltas before returning the final content', async () => {
    const encoder = new TextEncoder()
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: vi.fn().mockReturnValue('text/event-stream')
      },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n'))
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"world"}}]}\n\n'))
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        }
      })
    } as any)
    const onDelta = vi.fn()

    const result = await sendChatWorkbenchMessageStream({
      apiKey: 'sk-test',
      baseUrl: '/v1/chat/completions',
      model: 'gpt-stream',
      messages: [{ role: 'user', content: 'ping' }]
    }, { onDelta })

    expect(onDelta.mock.calls.map(([chunk]) => chunk)).toEqual(['Hello ', 'world'])
    expect(result.content).toBe('Hello world')
    expect(global.fetch).toHaveBeenCalledWith(
      '/v1/chat/completions',
      expect.objectContaining({
        body: expect.stringContaining('"stream":true')
      })
    )
  })

  it('reports waiting status before reading a non-streaming response body', async () => {
    let resolveJson!: (value: unknown) => void
    const jsonPromise = new Promise((resolve) => {
      resolveJson = resolve
    })
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: vi.fn().mockReturnValue('application/json')
      },
      json: vi.fn().mockReturnValue(jsonPromise)
    } as any)
    const onStatus = vi.fn()

    const resultPromise = sendChatWorkbenchMessageStream({
      apiKey: 'sk-test',
      baseUrl: '/v1/chat/completions',
      model: 'gpt-json',
      messages: [{ role: 'user', content: 'ping' }]
    }, { onStatus })

    await Promise.resolve()

    expect(onStatus.mock.calls.map(([status]) => status)).toEqual(['connecting', 'waiting'])

    resolveJson({
      choices: [{ message: { content: 'full response' } }],
      model: 'gpt-json'
    })
    const result = await resultPromise

    expect(onStatus.mock.calls.map(([status]) => status)).toEqual(['connecting', 'waiting', 'finalizing'])
    expect(result.content).toBe('full response')
  })

  it('normalizes OpenAI-compatible image generation responses', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        data: [
          {
            b64_json: 'aGVsbG8=',
            revised_prompt: 'draw a safer cat'
          }
        ]
      })
    } as any)

    const result = await sendChatWorkbenchImageGeneration({
      apiKey: 'sk-test',
      baseUrl: '/v1/images/generations',
      model: 'gpt-image-2',
      prompt: 'draw a cat',
      size: '1024x1024',
      quality: 'high'
    })

    expect(global.fetch).toHaveBeenCalledWith(
      '/v1/images/generations',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"model":"gpt-image-2"')
      })
    )
    expect(result.images).toEqual([
      {
        url: 'data:image/png;base64,aGVsbG8=',
        revisedPrompt: 'draw a safer cat'
      }
    ])
  })
})
