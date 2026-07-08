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
    const onStatus = vi.fn()
    const json = vi.fn().mockImplementation(() => {
      expect(onStatus.mock.calls.map(([status]) => status)).toEqual(['connecting', 'waiting'])
      return jsonPromise
    })
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: vi.fn().mockReturnValue('application/json')
      },
      json
    } as any)

    const resultPromise = sendChatWorkbenchMessageStream({
      apiKey: 'sk-test',
      baseUrl: '/v1/chat/completions',
      model: 'gpt-json',
      messages: [{ role: 'user', content: 'ping' }]
    }, { onStatus })

    await Promise.resolve()

    resolveJson({
      choices: [{ message: { content: 'full response' } }],
      model: 'gpt-json'
    })
    const result = await resultPromise

    expect(json).toHaveBeenCalledTimes(1)
    expect(onStatus.mock.calls.map(([status]) => status)).toEqual(['connecting', 'waiting', 'finalizing'])
    expect(result.content).toBe('full response')
  })
  it('surfaces waiting status while the gateway has not returned response headers', async () => {
    vi.useFakeTimers()
    try {
      let resolveFetch!: (value: unknown) => void
      const fetchPromise = new Promise((resolve) => {
        resolveFetch = resolve
      })
      global.fetch = vi.fn().mockReturnValue(fetchPromise)
      const onStatus = vi.fn()

      const resultPromise = sendChatWorkbenchMessageStream({
        apiKey: 'sk-test',
        baseUrl: '/v1/chat/completions',
        model: 'gpt-slow',
        messages: [{ role: 'user', content: 'ping' }]
      }, { onStatus })

      await vi.advanceTimersByTimeAsync(1200)

      expect(onStatus.mock.calls.map(([status]) => status)).toEqual(['connecting', 'waiting'])

      resolveFetch({
        ok: true,
        status: 200,
        headers: {
          get: vi.fn().mockReturnValue('application/json')
        },
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'late response' } }],
          model: 'gpt-slow'
        })
      } as any)

      const result = await resultPromise

      expect(result.content).toBe('late response')
    } finally {
      vi.useRealTimers()
    }
  })

  it('wires external abort signals into streaming requests', async () => {
    const controller = new AbortController()
    global.fetch = vi.fn().mockImplementation((_url, init: RequestInit) => (
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'))
        }, { once: true })
      })
    ))

    const resultPromise = sendChatWorkbenchMessageStream({
      apiKey: 'sk-test',
      baseUrl: '/v1/chat/completions',
      model: 'gpt-slow',
      messages: [{ role: 'user', content: 'ping' }],
      signal: controller.signal
    })

    await Promise.resolve()
    const requestInit = (global.fetch as any).mock.calls[0][1] as RequestInit
    expect(requestInit.signal).toBeDefined()

    controller.abort()

    await expect(resultPromise).rejects.toMatchObject({ name: 'AbortError' })
    expect(requestInit.signal?.aborted).toBe(true)
  })
  it('extracts non-streaming Responses API output text', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: vi.fn().mockReturnValue('application/json')
      },
      json: vi.fn().mockResolvedValue({
        output_text: 'response api text',
        model: 'gpt-responses'
      })
    } as any)

    const result = await sendChatWorkbenchMessageStream({
      apiKey: 'sk-test',
      baseUrl: '/v1/responses',
      model: 'gpt-responses',
      messages: [{ role: 'user', content: 'ping' }]
    })

    expect(result.content).toBe('response api text')
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
      quality: 'high',
      background: 'transparent',
      outputFormat: 'webp',
      outputCompression: 70,
      responseFormat: 'b64_json'
    })

    const imageBody = JSON.parse((global.fetch as any).mock.calls[0][1].body)
    expect(imageBody).toMatchObject({
      model: 'gpt-image-2',
      prompt: 'draw a cat',
      size: '1024x1024',
      quality: 'high',
      n: 1,
      background: 'transparent',
      output_format: 'webp',
      output_compression: 70,
      response_format: 'b64_json'
    })
    expect(result.images).toEqual([
      {
        url: 'data:image/webp;base64,aGVsbG8=',
        revisedPrompt: 'draw a safer cat',
        size: '1024x1024'
      }
    ])
  })
})
