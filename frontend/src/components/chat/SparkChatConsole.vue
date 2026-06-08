<template>
  <section
    class="spark-chat-console flex min-h-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-dark-700 dark:bg-dark-900"
    :class="layout === 'split' ? 'h-full' : 'h-[620px] max-h-[calc(100vh-8rem)]'"
  >
    <header class="flex flex-col gap-3 border-b border-gray-200 p-4 dark:border-dark-700 sm:flex-row sm:items-start sm:justify-between">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <Icon name="chat" size="sm" class="text-primary-500" />
          <h2 class="truncate text-base font-semibold text-gray-950 dark:text-white">
            {{ title || t('chatConsole.title') }}
          </h2>
        </div>
        <p class="mt-1 line-clamp-2 text-sm text-gray-600 dark:text-dark-300">
          {{ description || t('chatConsole.description') }}
        </p>
      </div>
      <div class="flex flex-shrink-0 items-center gap-2">
        <button type="button" class="btn btn-secondary btn-sm" :disabled="sending" @click="resetConversation">
          <Icon name="refresh" size="sm" class="mr-1" />
          {{ t('chatConsole.reset') }}
        </button>
        <button type="button" class="btn btn-primary btn-sm" :disabled="sending || !canSend" @click="sendMessage">
          <Icon v-if="!sending" name="arrowRight" size="sm" class="mr-1" />
          {{ sending ? t('chatConsole.sending') : t('chatConsole.send') }}
        </button>
      </div>
    </header>

    <div :class="contentLayoutClass">
      <aside :class="settingsPanelClass">
        <section class="space-y-3">
          <div>
            <label class="input-label">{{ t('chatConsole.apiKey') }}</label>
            <input
              v-model="apiKey"
              class="input"
              type="password"
              autocomplete="off"
              :placeholder="t('chatConsole.apiKeyPlaceholder')"
            />
            <p class="input-hint">{{ t('chatConsole.apiKeyHint') }}</p>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="min-w-0">
              <label class="input-label">{{ t('chatConsole.model') }}</label>
              <input v-model="model" class="input" autocomplete="off" />
            </div>
            <div class="min-w-0">
              <label class="input-label">{{ t('chatConsole.temperature') }}</label>
              <input v-model.number="temperature" class="input" min="0" max="1" step="0.1" type="number" />
            </div>
          </div>
        </section>

        <section v-if="showModeControls" class="space-y-3">
          <label class="input-label">{{ t('chatConsole.mode') }}</label>
          <div class="grid grid-cols-2 gap-2">
            <button
              v-for="option in modeOptions"
              :key="option.value"
              type="button"
              class="rounded-lg border px-3 py-2 text-left text-sm transition-colors"
              :class="mode === option.value
                ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-200'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-dark-700 dark:text-dark-300 dark:hover:bg-dark-800'"
              @click="mode = option.value"
            >
              {{ option.label }}
            </button>
          </div>
        </section>

        <section class="space-y-3">
          <label class="input-label">{{ t('chatConsole.projectContext') }}</label>
          <textarea
            v-model="projectContext"
            class="input resize-y"
            :class="layout === 'split' ? 'min-h-[150px]' : 'min-h-[88px]'"
            :placeholder="t('chatConsole.projectContextPlaceholder')"
          />
        </section>

        <section class="space-y-3">
          <div class="flex items-center justify-between gap-3">
            <label class="input-label mb-0">{{ t('chatConsole.files') }}</label>
            <button type="button" class="btn btn-secondary btn-xs" :disabled="sending" @click="openFilePicker">
              <Icon name="upload" size="xs" class="mr-1" />
              {{ t('chatConsole.chooseFiles') }}
            </button>
          </div>

          <div
            class="rounded-lg border border-dashed p-3 text-sm transition-colors"
            :class="isDragging
              ? 'border-primary-400 bg-primary-50 text-primary-700 dark:border-primary-600 dark:bg-primary-900/20 dark:text-primary-200'
              : 'border-gray-300 bg-gray-50 text-gray-600 dark:border-dark-700 dark:bg-dark-800 dark:text-dark-300'"
            @dragenter.prevent="isDragging = true"
            @dragover.prevent="isDragging = true"
            @dragleave.prevent="isDragging = false"
            @drop.prevent="handleFileDrop"
          >
            <input
              ref="fileInput"
              type="file"
              class="hidden"
              multiple
              :accept="acceptedFileTypes"
              @change="handleFileChange"
            />
            <div class="flex items-start gap-2">
              <Icon name="document" size="sm" class="mt-0.5 flex-shrink-0" />
              <div class="min-w-0">
                <div class="font-medium">{{ t('chatConsole.dropFiles') }}</div>
                <p class="mt-1 text-xs leading-5 text-gray-500 dark:text-dark-400">
                  {{ t('chatConsole.fileHint', { maxFiles, maxSize: maxFileSizeLabel }) }}
                </p>
              </div>
            </div>
          </div>

          <div v-if="attachments.length > 0" class="space-y-2">
            <article
              v-for="file in attachments"
              :key="file.id"
              class="flex min-w-0 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-dark-700 dark:bg-dark-800"
            >
              <Icon name="document" size="sm" class="flex-shrink-0 text-gray-500 dark:text-dark-400" />
              <div class="min-w-0 flex-1">
                <div class="truncate font-medium text-gray-900 dark:text-white" :title="file.name">
                  {{ file.name }}
                </div>
                <div class="truncate text-xs text-gray-500 dark:text-dark-400">
                  {{ formatBytes(file.size) }}
                  <span v-if="file.truncated"> - {{ t('chatConsole.truncated') }}</span>
                </div>
              </div>
              <button
                type="button"
                class="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-red-500 dark:hover:bg-dark-700"
                :title="t('chatConsole.removeFile')"
                @click="removeAttachment(file.id)"
              >
                <Icon name="x" size="sm" />
              </button>
            </article>
          </div>
        </section>

        <section class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-200">
          {{ t('chatConsole.safetyNote') }}
        </section>
      </aside>

      <main class="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div ref="conversationRef" class="min-h-0 flex-1 space-y-4 overflow-auto p-4">
          <div
            v-for="message in visibleMessages"
            :key="message.id"
            class="flex"
            :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
          >
            <article
              class="max-w-[min(780px,94%)] rounded-lg border px-4 py-3 text-sm leading-6"
              :class="message.role === 'user'
                ? 'border-primary-200 bg-primary-50 text-primary-950 dark:border-primary-900/50 dark:bg-primary-900/20 dark:text-primary-100'
                : 'border-gray-200 bg-gray-50 text-gray-800 dark:border-dark-700 dark:bg-dark-800 dark:text-dark-100'"
            >
              <div class="mb-1 text-xs font-medium uppercase text-gray-500 dark:text-dark-400">
                {{ message.role === 'user' ? t('chatConsole.you') : t('chatConsole.assistant') }}
              </div>
              <div class="whitespace-pre-wrap break-words">{{ message.content }}</div>
            </article>
          </div>

          <div v-if="visibleMessages.length === 0" class="flex h-full items-center justify-center">
            <div class="max-w-lg text-center">
              <div class="text-base font-medium text-gray-900 dark:text-white">
                {{ t('chatConsole.emptyTitle') }}
              </div>
              <p class="mt-2 text-sm text-gray-500 dark:text-dark-300">
                {{ t('chatConsole.emptyDescription') }}
              </p>
            </div>
          </div>
        </div>

        <form class="border-t border-gray-200 p-4 dark:border-dark-700" @submit.prevent="sendMessage">
          <div class="flex flex-col gap-3">
            <textarea
              v-model="draft"
              class="input min-h-[92px] resize-y"
              :placeholder="t('chatConsole.promptPlaceholder')"
              @keydown="handleDraftKeydown"
            />
            <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div class="text-xs text-gray-500 dark:text-dark-400">
                {{ t('chatConsole.submitHint') }}
                <span v-if="attachments.length > 0"> - {{ t('chatConsole.attachedCount', { count: attachments.length }) }}</span>
              </div>
              <button class="btn btn-primary" type="submit" :disabled="sending || !canSend">
                {{ sending ? t('chatConsole.sending') : t('chatConsole.send') }}
              </button>
            </div>
          </div>
        </form>
      </main>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { sendChatWorkbenchMessage, type ChatWorkbenchMessage } from '@/api/chatWorkbench'
import Icon from '@/components/icons/Icon.vue'
import { useAppStore } from '@/stores/app'

type WorkbenchMode = 'ops' | 'patch' | 'security' | 'ux'
type LayoutMode = 'split' | 'compact'

interface UiMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface ChatAttachment {
  id: string
  name: string
  size: number
  content: string
  truncated: boolean
}

const props = withDefaults(defineProps<{
  title?: string
  description?: string
  layout?: LayoutMode
  storageKey?: string
  defaultContext?: string
  showModeControls?: boolean
  defaultMode?: WorkbenchMode
}>(), {
  title: '',
  description: '',
  layout: 'split',
  storageKey: 'sparkapi_chat_console',
  defaultContext: '',
  showModeControls: true,
  defaultMode: 'ops'
})

const { t } = useI18n()
const appStore = useAppStore()

const maxFiles = 8
const maxFileBytes = 256 * 1024
const maxTotalAttachmentChars = 24000
const acceptedFileTypes = [
  '.txt',
  '.md',
  '.json',
  '.log',
  '.csv',
  '.yaml',
  '.yml',
  '.xml',
  '.html',
  '.js',
  '.ts',
  '.vue',
  '.go',
  '.py',
  '.ps1',
  '.env'
].join(',')

const apiKey = ref(sessionStorage.getItem(`${props.storageKey}_api_key`) || '')
const model = ref(localStorage.getItem(`${props.storageKey}_model`) || 'gpt-5.4')
const temperature = ref(0.2)
const mode = ref<WorkbenchMode>(props.defaultMode)
const projectContext = ref('')
const draft = ref('')
const sending = ref(false)
const isDragging = ref(false)
const messages = ref<UiMessage[]>([])
const attachments = ref<ChatAttachment[]>([])
const conversationRef = ref<HTMLElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

const modeOptions = computed(() => [
  { value: 'ops' as const, label: t('chatConsole.modes.ops') },
  { value: 'patch' as const, label: t('chatConsole.modes.patch') },
  { value: 'security' as const, label: t('chatConsole.modes.security') },
  { value: 'ux' as const, label: t('chatConsole.modes.ux') }
])

const visibleMessages = computed(() => messages.value)
const canSend = computed(() => (
  apiKey.value.trim() !== '' &&
  model.value.trim() !== '' &&
  (draft.value.trim() !== '' || attachments.value.length > 0)
))
const maxFileSizeLabel = computed(() => formatBytes(maxFileBytes))
const contentLayoutClass = computed(() => (
  props.layout === 'split'
    ? 'grid min-h-0 flex-1 gap-0 lg:grid-cols-[360px,minmax(0,1fr)]'
    : 'flex min-h-0 flex-1 flex-col'
))
const settingsPanelClass = computed(() => (
  props.layout === 'split'
    ? 'flex min-h-0 flex-col gap-4 overflow-auto border-b border-gray-200 p-4 dark:border-dark-700 lg:border-b-0 lg:border-r'
    : 'flex max-h-[280px] flex-col gap-3 overflow-auto border-b border-gray-200 p-4 dark:border-dark-700'
))

watch(apiKey, (value) => {
  if (value) {
    sessionStorage.setItem(`${props.storageKey}_api_key`, value)
  } else {
    sessionStorage.removeItem(`${props.storageKey}_api_key`)
  }
})

watch(model, (value) => {
  localStorage.setItem(`${props.storageKey}_model`, value)
})

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function openFilePicker() {
  fileInput.value?.click()
}

function removeAttachment(id: string) {
  attachments.value = attachments.value.filter((item) => item.id !== id)
}

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  addFiles(Array.from(input.files || []))
  input.value = ''
}

function handleFileDrop(event: DragEvent) {
  isDragging.value = false
  addFiles(Array.from(event.dataTransfer?.files || []))
}

async function addFiles(files: File[]) {
  if (files.length === 0) return

  const slotsLeft = maxFiles - attachments.value.length
  if (slotsLeft <= 0) {
    appStore.showWarning(t('chatConsole.tooManyFiles', { max: maxFiles }))
    return
  }

  const selected = files.slice(0, slotsLeft)
  if (files.length > selected.length) {
    appStore.showWarning(t('chatConsole.fileSelectionCapped', { max: maxFiles }))
  }

  for (const file of selected) {
    try {
      const slice = file.size > maxFileBytes ? file.slice(0, maxFileBytes) : file
      const content = await slice.text()
      if (!content.trim()) {
        appStore.showWarning(t('chatConsole.emptyFileSkipped', { name: file.name }))
        continue
      }
      attachments.value.push({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: file.name,
        size: file.size,
        content: content.trim(),
        truncated: file.size > maxFileBytes
      })
    } catch {
      appStore.showError(t('chatConsole.fileReadFailed', { name: file.name }))
    }
  }

  enforceAttachmentBudget()
}

function enforceAttachmentBudget() {
  let total = 0
  attachments.value = attachments.value.map((file) => {
    const remaining = Math.max(maxTotalAttachmentChars - total, 0)
    if (remaining <= 0) {
      return { ...file, content: '', truncated: true }
    }

    if (file.content.length > remaining) {
      total += remaining
      return { ...file, content: file.content.slice(0, remaining), truncated: true }
    }

    total += file.content.length
    return file
  }).filter((file) => file.content.trim() !== '')
}

function buildAttachmentContext(): string {
  if (attachments.value.length === 0) return ''

  return attachments.value
    .map((file, index) => [
      `File ${index + 1}: ${file.name}`,
      `Size: ${formatBytes(file.size)}${file.truncated ? ' (truncated)' : ''}`,
      '```',
      file.content,
      '```'
    ].join('\n'))
    .join('\n\n')
}

function buildSystemPrompt(): string {
  const modePrompts: Record<WorkbenchMode, string> = {
    ops: 'You are helping operate SparkAPI. Prioritize diagnosis, concrete commands, config checks, and safe rollback paths.',
    patch: 'You are helping plan SparkAPI code changes. Produce scoped implementation steps and patch-oriented guidance. Do not claim files were changed.',
    security: 'You are reviewing SparkAPI security. Focus on secrets, auth boundaries, injection risks, SSRF, logging, exports, and credential handling.',
    ux: 'You are improving SparkAPI admin UX. Favor dense operational workflows, clear state, accessible controls, and safe bulk actions.'
  }

  const parts = [
    'You are SparkAPI Chat Console, an assistant embedded in a self-hosted AI gateway.',
    modePrompts[mode.value],
    'Treat attached file content as operator-provided context. Do not claim to access files that are not included in the prompt.',
    'Never ask the browser to execute server-side file changes directly. Provide reviewable steps and highlight risk.',
    props.defaultContext,
    projectContext.value.trim() ? `Operator context:\n${projectContext.value.trim()}` : '',
    buildAttachmentContext() ? `Attached file context:\n${buildAttachmentContext()}` : ''
  ]

  return parts.filter(Boolean).join('\n\n')
}

function toChatMessages(nextUserMessage: string): ChatWorkbenchMessage[] {
  return [
    { role: 'system', content: buildSystemPrompt() },
    ...messages.value.map((message) => ({ role: message.role, content: message.content })),
    { role: 'user', content: nextUserMessage }
  ]
}

async function scrollToBottom() {
  await nextTick()
  const el = conversationRef.value
  if (el) {
    el.scrollTop = el.scrollHeight
  }
}

async function sendMessage() {
  if (!canSend.value || sending.value) return

  const content = draft.value.trim() || t('chatConsole.defaultFileQuestion')
  const userMessage: UiMessage = {
    id: `user-${Date.now()}`,
    role: 'user',
    content
  }

  const requestMessages = toChatMessages(content)
  messages.value.push(userMessage)
  draft.value = ''
  sending.value = true
  await scrollToBottom()

  try {
    const response = await sendChatWorkbenchMessage({
      apiKey: apiKey.value.trim(),
      model: model.value.trim(),
      temperature: temperature.value,
      messages: requestMessages,
      maxTokens: 2000
    })
    messages.value.push({
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: response.content
    })
    await scrollToBottom()
  } catch (error: any) {
    appStore.showError(error?.message || t('chatConsole.sendFailed'))
  } finally {
    sending.value = false
  }
}

function resetConversation() {
  if (sending.value) return
  messages.value = []
}

function handleDraftKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault()
    sendMessage()
  }
}
</script>
