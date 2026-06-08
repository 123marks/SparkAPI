export interface ChatWorkbenchMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatWorkbenchRequest {
  apiKey: string
  model: string
  messages: ChatWorkbenchMessage[]
  temperature?: number
  maxTokens?: number
}

export interface ChatWorkbenchResponse {
  content: string
  model?: string
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
  const response = await fetch('/v1/chat/completions', {
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
    const message =
      typeof payload?.error?.message === 'string'
        ? payload.error.message
        : typeof payload?.message === 'string'
          ? payload.message
          : `Request failed with status ${response.status}`
    throw new Error(message)
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
