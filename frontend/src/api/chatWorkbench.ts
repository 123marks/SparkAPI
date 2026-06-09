export interface ChatWorkbenchMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatWorkbenchRequest {
  apiKey: string
  baseUrl?: string
  model: string
  messages: ChatWorkbenchMessage[]
  temperature?: number
  maxTokens?: number
}

export interface ChatWorkbenchResponse {
  content: string
  model?: string
}

export class ChatWorkbenchError extends Error {
  status: number
  endpoint: string
  model: string
  upstreamMessage: string

  constructor(options: {
    message: string
    status: number
    endpoint: string
    model: string
    upstreamMessage?: string
  }) {
    super(options.message)
    this.name = 'ChatWorkbenchError'
    this.status = options.status
    this.endpoint = options.endpoint
    this.model = options.model
    this.upstreamMessage = options.upstreamMessage || options.message
  }
}

interface OpenAIChatChoice {
  message?: {
    content?: unknown
  }
}

interface OpenAIChatResponse {
  choices?: OpenAIChatChoice[]
  model?: string
}

function normalizeAssistantContent(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part
        if (part && typeof part === 'object' && 'text' in part) {
          return String((part as { text?: unknown }).text ?? '')
        }
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }

  return ''
}

export async function sendChatWorkbenchMessage(request: ChatWorkbenchRequest): Promise<ChatWorkbenchResponse> {
  const requestUrl = request.baseUrl?.trim() || '/v1/chat/completions'
  const response = await fetch(requestUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${request.apiKey}`
    },
    body: JSON.stringify({
      model: request.model,
      messages: request.messages,
      temperature: request.temperature ?? 0.2,
      max_tokens: request.maxTokens ?? 1600,
      stream: false
    })
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const upstreamMessage =
      typeof payload?.error?.message === 'string'
        ? payload.error.message
        : typeof payload?.message === 'string'
          ? payload.message
          : `Request failed with status ${response.status}`
    throw new ChatWorkbenchError({
      message: upstreamMessage,
      status: response.status,
      endpoint: requestUrl,
      model: request.model,
      upstreamMessage
    })
  }

  const data = payload as OpenAIChatResponse
  const content = normalizeAssistantContent(data.choices?.[0]?.message?.content)
  if (!content) {
    throw new Error('Empty assistant response')
  }

  return {
    content,
    model: data.model
  }
}
