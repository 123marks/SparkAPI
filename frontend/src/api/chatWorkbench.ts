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

export interface ChatWorkbenchImageGenerationRequest {
  apiKey: string
  baseUrl?: string
  model: string
  prompt: string
  size?: string
  quality?: string
  n?: number
}

export interface ChatWorkbenchGeneratedImage {
  url: string
  revisedPrompt?: string
}

export interface ChatWorkbenchImageGenerationResponse {
  images: ChatWorkbenchGeneratedImage[]
}

export interface ChatWorkbenchStreamHandlers {
  onDelta?: (delta: string) => void
  onStatus?: (status: 'connecting' | 'waiting' | 'streaming' | 'finalizing') => void
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
  delta?: {
    content?: unknown
  }
  text?: unknown
}

interface OpenAIChatResponse {
  choices?: OpenAIChatChoice[]
  model?: string
  output_text?: unknown
  output?: Array<{
    content?: Array<{
      type?: string
      text?: unknown
    }>
  }>
}

interface OpenAIImageGenerationResponse {
  data?: Array<{
    url?: unknown
    b64_json?: unknown
    revised_prompt?: unknown
  }>
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

function getRequestUrl(request: ChatWorkbenchRequest): string {
  return request.baseUrl?.trim() || '/v1/chat/completions'
}

function buildChatRequestInit(request: ChatWorkbenchRequest, stream: boolean): RequestInit {
  return {
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
      stream
    })
  }
}

async function readResponsePayload(response: Response): Promise<any> {
  if (typeof response.json === 'function') {
    return response.json().catch(() => ({}))
  }

  if (typeof response.text === 'function') {
    const text = await response.text().catch(() => '')
    if (!text) return {}
    try {
      return JSON.parse(text)
    } catch {
      return { message: text }
    }
  }

  return {}
}

function getUpstreamErrorMessage(payload: any, status: number): string {
  return typeof payload?.error?.message === 'string'
    ? payload.error.message
    : typeof payload?.message === 'string'
      ? payload.message
      : `Request failed with status ${status}`
}

function throwStructuredError(payload: any, status: number, endpoint: string, model: string): never {
  const upstreamMessage = getUpstreamErrorMessage(payload, status)
  throw new ChatWorkbenchError({
    message: upstreamMessage,
    status,
    endpoint,
    model,
    upstreamMessage
  })
}

function isEventStreamResponse(response: Response): boolean {
  const contentType = response.headers?.get?.('content-type') || ''
  return contentType.toLowerCase().includes('text/event-stream')
}

function extractStreamingDelta(payload: any): string {
  if (!payload || typeof payload !== 'object') return ''

  const chatChoice = Array.isArray(payload.choices) ? payload.choices[0] as OpenAIChatChoice | undefined : undefined
  const deltaContent = normalizeAssistantContent(chatChoice?.delta?.content)
  if (deltaContent) return deltaContent

  const messageContent = normalizeAssistantContent(chatChoice?.message?.content)
  if (messageContent) return messageContent

  const choiceText = normalizeAssistantContent(chatChoice?.text)
  if (choiceText) return choiceText

  if (typeof payload.delta === 'string') {
    return payload.delta
  }

  if (payload.type === 'response.output_text.delta' && typeof payload.delta === 'string') {
    return payload.delta
  }

  if (payload.type === 'response.output_text.done' && typeof payload.text === 'string') {
    return ''
  }

  if (payload.type === 'content_block_delta' && typeof payload.delta?.text === 'string') {
    return payload.delta.text
  }

  if (payload.type === 'message_delta' && typeof payload.delta?.text === 'string') {
    return payload.delta.text
  }

  return ''
}

function extractResponseContent(payload: any): string {
  if (!payload || typeof payload !== 'object') return ''

  const chatChoice = Array.isArray(payload.choices) ? payload.choices[0] as OpenAIChatChoice | undefined : undefined
  const chatContent = normalizeAssistantContent(chatChoice?.message?.content)
  if (chatContent) return chatContent

  const outputText = normalizeAssistantContent(payload.output_text)
  if (outputText) return outputText

  if (Array.isArray(payload.output)) {
    return payload.output
      .flatMap((item: any) => Array.isArray(item?.content) ? item.content : [])
      .map((part: any) => normalizeAssistantContent(part?.text))
      .filter(Boolean)
      .join('\n')
  }

  return ''
}

function parseSSEBlocks(buffer: string): { blocks: string[], remainder: string } {
  const normalized = buffer.replace(/\r\n/g, '\n')
  const parts = normalized.split('\n\n')
  return {
    blocks: parts.slice(0, -1),
    remainder: parts.at(-1) || ''
  }
}

function parseSSEData(block: string): string {
  return block
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n')
    .trim()
}

async function parseStreamingResponse(
  response: Response,
  handlers: ChatWorkbenchStreamHandlers
): Promise<ChatWorkbenchResponse> {
  const reader = response.body?.getReader()
  if (!reader) {
    const payload = await readResponsePayload(response)
    const data = payload as OpenAIChatResponse
    return {
      content: normalizeAssistantContent(data.choices?.[0]?.message?.content),
      model: data.model
    }
  }

  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''
  let model: string | undefined
  let sawDelta = false

  const handleBlock = (block: string) => {
    const data = parseSSEData(block)
    if (!data || data === '[DONE]') return

    let payload: any
    try {
      payload = JSON.parse(data)
    } catch {
      return
    }

    if (typeof payload.model === 'string') {
      model = payload.model
    }

    const delta = extractStreamingDelta(payload)
    if (!delta) return
    content += delta
    sawDelta = true
    handlers.onStatus?.('streaming')
    handlers.onDelta?.(delta)
  }

  while (true) {
    const { value, done } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const parsed = parseSSEBlocks(buffer)
    parsed.blocks.forEach(handleBlock)
    buffer = parsed.remainder

    if (!sawDelta && buffer.includes('\n')) {
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (!line.trim().startsWith('data:')) continue
        handleBlock(line)
      }
    }
  }

  buffer += decoder.decode()
  if (buffer.trim()) {
    handleBlock(buffer)
  }

  handlers.onStatus?.('finalizing')
  return { content, model }
}

export async function sendChatWorkbenchMessage(request: ChatWorkbenchRequest): Promise<ChatWorkbenchResponse> {
  const requestUrl = getRequestUrl(request)
  const response = await fetch(requestUrl, buildChatRequestInit(request, false))
  const payload = await readResponsePayload(response)
  if (!response.ok) {
    throwStructuredError(payload, response.status, requestUrl, request.model)
  }

  const data = payload as OpenAIChatResponse
  const content = extractResponseContent(data)
  if (!content) {
    throw new Error('Empty assistant response')
  }

  return {
    content,
    model: data.model
  }
}

export async function sendChatWorkbenchMessageStream(
  request: ChatWorkbenchRequest,
  handlers: ChatWorkbenchStreamHandlers = {}
): Promise<ChatWorkbenchResponse> {
  const requestUrl = request.baseUrl?.trim() || '/v1/chat/completions'
  handlers.onStatus?.('connecting')
  const response = await fetch(requestUrl, buildChatRequestInit(request, true))

  if (!response.ok) {
    const payload = await readResponsePayload(response)
    throwStructuredError(payload, response.status, requestUrl, request.model)
  }

  if (isEventStreamResponse(response)) {
    handlers.onStatus?.('waiting')
    const streamed = await parseStreamingResponse(response, handlers)
    if (!streamed.content) {
      throw new Error('Empty assistant response')
    }
    return streamed
  }

  handlers.onStatus?.('waiting')
  const payload = await readResponsePayload(response)
  const data = payload as OpenAIChatResponse
  const content = extractResponseContent(data)
  if (!content) {
    throw new Error('Empty assistant response')
  }
  handlers.onStatus?.('finalizing')

  return {
    content,
    model: data.model
  }
}

export async function sendChatWorkbenchImageGeneration(
  request: ChatWorkbenchImageGenerationRequest
): Promise<ChatWorkbenchImageGenerationResponse> {
  const requestUrl = request.baseUrl?.trim() || '/v1/images/generations'
  const response = await fetch(requestUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${request.apiKey}`
    },
    body: JSON.stringify({
      model: request.model,
      prompt: request.prompt,
      size: request.size || '1024x1024',
      quality: request.quality || 'auto',
      n: request.n ?? 1,
      response_format: 'b64_json'
    })
  })

  const payload = await readResponsePayload(response)
  if (!response.ok) {
    throwStructuredError(payload, response.status, requestUrl, request.model)
  }

  const data = payload as OpenAIImageGenerationResponse
  const images = (data.data || [])
    .reduce<ChatWorkbenchGeneratedImage[]>((items, item) => {
      const url = typeof item.url === 'string'
        ? item.url
        : typeof item.b64_json === 'string'
          ? `data:image/png;base64,${item.b64_json}`
          : ''
      if (!url) return items
      items.push({
        url,
        revisedPrompt: typeof item.revised_prompt === 'string' ? item.revised_prompt : undefined
      })
      return items
    }, [])

  if (images.length === 0) {
    throw new Error('No image returned')
  }

  return { images }
}
