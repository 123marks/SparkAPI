<template>
  <AppLayout>
    <div class="flex h-[calc(100vh-5rem)] min-h-[680px] flex-col gap-4">
      <div class="flex flex-col gap-3 border-b border-gray-200 pb-4 dark:border-dark-700 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 class="text-2xl font-semibold tracking-normal text-gray-950 dark:text-white">
            {{ t('admin.chatWorkbench.title') }}
          </h1>
          <p class="mt-1 max-w-3xl text-sm text-gray-600 dark:text-dark-300">
            {{ t('admin.chatWorkbench.description') }}
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="btn btn-secondary btn-sm" :disabled="sending" @click="resetConversation">
            {{ t('admin.chatWorkbench.reset') }}
          </button>
          <button type="button" class="btn btn-primary btn-sm" :disabled="sending || !canSend" @click="sendMessage">
            <span v-if="sending">{{ t('admin.chatWorkbench.sending') }}</span>
            <span v-else>{{ t('admin.chatWorkbench.send') }}</span>
          </button>
        </div>
      </div>

      <div class="grid min-h-0 flex-1 gap-4 lg:grid-cols-[360px,minmax(0,1fr)]">
        <aside class="flex min-h-0 flex-col gap-4 overflow-auto rounded-lg border border-gray-200 bg-white p-4 dark:border-dark-700 dark:bg-dark-900">
          <section class="space-y-3">
            <div>
              <label class="input-label">{{ t('admin.chatWorkbench.apiKey') }}</label>
              <input
                v-model="apiKey"
                class="input"
                type="password"
                autocomplete="off"
                :placeholder="t('admin.chatWorkbench.apiKeyPlaceholder')"
              />
              <p class="input-hint">{{ t('admin.chatWorkbench.apiKeyHint') }}</p>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="input-label">{{ t('admin.chatWorkbench.model') }}</label>
                <input v-model="model" class="input" autocomplete="off" />
              </div>
              <div>
                <label class="input-label">{{ t('admin.chatWorkbench.temperature') }}</label>
                <input v-model.number="temperature" class="input" min="0" max="1" step="0.1" type="number" />
              </div>
            </div>
          </section>

          <section class="space-y-3">
            <label class="input-label">{{ t('admin.chatWorkbench.mode') }}</label>
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
            <label class="input-label">{{ t('admin.chatWorkbench.projectContext') }}</label>
            <textarea
              v-model="projectContext"
              class="input min-h-[180px] resize-y"
              :placeholder="t('admin.chatWorkbench.projectContextPlaceholder')"
            />
          </section>

          <section class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-200">
            {{ t('admin.chatWorkbench.safetyNote') }}
          </section>
        </aside>

        <main class="flex min-h-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-dark-700 dark:bg-dark-900">
          <div ref="conversationRef" class="min-h-0 flex-1 space-y-4 overflow-auto p-4">
            <div
              v-for="message in visibleMessages"
              :key="message.id"
              class="flex"
              :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
            >
              <article
                class="max-w-[min(780px,92%)] rounded-lg border px-4 py-3 text-sm leading-6"
                :class="message.role === 'user'
                  ? 'border-primary-200 bg-primary-50 text-primary-950 dark:border-primary-900/50 dark:bg-primary-900/20 dark:text-primary-100'
                  : 'border-gray-200 bg-gray-50 text-gray-800 dark:border-dark-700 dark:bg-dark-800 dark:text-dark-100'"
              >
                <div class="mb-1 text-xs font-medium uppercase text-gray-500 dark:text-dark-400">
                  {{ message.role === 'user' ? t('admin.chatWorkbench.you') : t('admin.chatWorkbench.assistant') }}
                </div>
                <div class="whitespace-pre-wrap break-words">{{ message.content }}</div>
              </article>
            </div>

            <div v-if="visibleMessages.length === 0" class="flex h-full items-center justify-center">
              <div class="max-w-lg text-center">
                <div class="text-base font-medium text-gray-900 dark:text-white">
                  {{ t('admin.chatWorkbench.emptyTitle') }}
                </div>
                <p class="mt-2 text-sm text-gray-500 dark:text-dark-300">
                  {{ t('admin.chatWorkbench.emptyDescription') }}
                </p>
              </div>
            </div>
          </div>

          <form class="border-t border-gray-200 p-4 dark:border-dark-700" @submit.prevent="sendMessage">
            <div class="flex flex-col gap-3">
              <textarea
                v-model="draft"
                class="input min-h-[96px] resize-y"
                :placeholder="t('admin.chatWorkbench.promptPlaceholder')"
                @keydown="handleDraftKeydown"
              />
              <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div class="text-xs text-gray-500 dark:text-dark-400">
                  {{ t('admin.chatWorkbench.submitHint') }}
                </div>
                <button class="btn btn-primary" type="submit" :disabled="sending || !canSend">
                  {{ sending ? t('admin.chatWorkbench.sending') : t('admin.chatWorkbench.send') }}
                </button>
              </div>
            </div>
          </form>
        </main>
      </div>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppLayout from '@/components/layout/AppLayout.vue'
import { sendChatWorkbenchMessage, type ChatWorkbenchMessage } from '@/api/chatWorkbench'
import { useAppStore } from '@/stores/app'

type WorkbenchMode = 'ops' | 'patch' | 'security' | 'ux'

interface UiMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

const { t } = useI18n()
const appStore = useAppStore()

const apiKey = ref(sessionStorage.getItem('sparkapi_chat_workbench_api_key') || '')
const model = ref(localStorage.getItem('sparkapi_chat_workbench_model') || 'gpt-5.4')
const temperature = ref(0.2)
const mode = ref<WorkbenchMode>('ops')
const projectContext = ref('SparkAPI is a self-hosted AI API gateway based on sub2api. Focus on account pools, routing, safe admin operations, and practical fixes.')
const draft = ref('')
const sending = ref(false)
const messages = ref<UiMessage[]>([])
const conversationRef = ref<HTMLElement | null>(null)

const modeOptions = computed(() => [
  { value: 'ops' as const, label: t('admin.chatWorkbench.modes.ops') },
  { value: 'patch' as const, label: t('admin.chatWorkbench.modes.patch') },
  { value: 'security' as const, label: t('admin.chatWorkbench.modes.security') },
  { value: 'ux' as const, label: t('admin.chatWorkbench.modes.ux') }
])

const visibleMessages = computed(() => messages.value)
const canSend = computed(() => apiKey.value.trim() !== '' && model.value.trim() !== '' && draft.value.trim() !== '')

watch(apiKey, (value) => {
  if (value) {
    sessionStorage.setItem('sparkapi_chat_workbench_api_key', value)
  } else {
    sessionStorage.removeItem('sparkapi_chat_workbench_api_key')
  }
})

watch(model, (value) => {
  localStorage.setItem('sparkapi_chat_workbench_model', value)
})

function buildSystemPrompt(): string {
  const modePrompts: Record<WorkbenchMode, string> = {
    ops: 'You are helping operate SparkAPI. Prioritize diagnosis, concrete commands, config checks, and safe rollback paths.',
    patch: 'You are helping plan SparkAPI code changes. Produce scoped implementation steps and patch-oriented guidance. Do not claim files were changed.',
    security: 'You are reviewing SparkAPI security. Focus on secrets, auth boundaries, injection risks, SSRF, logging, exports, and credential handling.',
    ux: 'You are improving SparkAPI admin UX. Favor dense operational workflows, clear state, accessible controls, and safe bulk actions.'
  }

  return [
    'You are SparkAPI Workbench, an assistant embedded in a self-hosted AI gateway admin console.',
    modePrompts[mode.value],
    'Never instruct the browser to execute server-side file changes directly. Ask the operator to review patch plans before applying them.',
    'Project context:',
    projectContext.value.trim() || 'No extra context provided.'
  ].join('\n\n')
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

  const content = draft.value.trim()
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
      messages: requestMessages
    })
    messages.value.push({
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: response.content
    })
    await scrollToBottom()
  } catch (error: any) {
    appStore.showError(error?.message || t('admin.chatWorkbench.sendFailed'))
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
