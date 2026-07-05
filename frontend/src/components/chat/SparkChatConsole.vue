<template>
  <section
    class="spark-chat-console flex min-h-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-dark-700 dark:bg-dark-900"
    :class="layout === 'split' ? 'h-full' : 'h-[620px] max-h-[calc(100vh-8rem)]'"
    @dragenter.prevent="handleConsoleDragEnter"
    @dragover.prevent="handleConsoleDragOver"
    @dragleave.prevent="handleConsoleDragLeave"
    @drop.prevent="handleFileDrop"
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
          {{ sending ? currentAssistantStatus : t('chatConsole.send') }}
        </button>
      </div>
    </header>

    <div :class="contentLayoutClass">
      <aside :class="settingsPanelClass">
        <section class="space-y-3">
          <div class="flex items-center justify-between gap-3">
            <label class="input-label mb-0">{{ t('chatConsole.history') }}</label>
            <button type="button" class="btn btn-secondary btn-xs" :disabled="sending" @click="createNewSession">
              <Icon name="plus" size="xs" class="mr-1" />
              {{ t('chatConsole.newChat') }}
            </button>
          </div>

          <div class="max-h-44 space-y-2 overflow-auto pr-1">
            <button
              v-for="session in sessions"
              :key="session.id"
              type="button"
              class="w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors"
              :class="session.id === activeSessionId
                ? 'border-primary-500 bg-primary-50 text-primary-800 dark:bg-primary-900/20 dark:text-primary-100'
                : 'border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-dark-700 dark:text-dark-200 dark:hover:bg-dark-800'"
              @click="selectSession(session.id)"
            >
              <div class="flex min-w-0 items-center justify-between gap-2">
                <span class="truncate font-medium">{{ session.title }}</span>
                <span class="flex-shrink-0 text-xs text-gray-400 dark:text-dark-500">{{ session.messages.length }}</span>
              </div>
              <div class="mt-1 truncate text-xs text-gray-500 dark:text-dark-400">
                {{ formatSessionTime(session.updatedAt) }}
              </div>
            </button>

            <div v-if="sessions.length === 0" class="rounded-lg border border-dashed border-gray-200 px-3 py-4 text-center text-xs text-gray-500 dark:border-dark-700 dark:text-dark-400">
              {{ t('chatConsole.noHistory') }}
            </div>
          </div>
        </section>

        <section class="space-y-3">
          <div>
            <label class="input-label">{{ t('chatConsole.requestUrl') }}</label>
            <input
              v-model="requestUrl"
              data-test="request-url-input"
              class="input"
              autocomplete="off"
              :placeholder="t('chatConsole.requestUrlPlaceholder')"
            />
            <p class="input-hint">{{ t('chatConsole.requestUrlHint') }}</p>
          </div>

          <div>
            <label class="input-label">{{ t('chatConsole.apiKey') }}</label>
            <select
              v-if="savedApiKeys.length > 0"
              v-model="selectedSavedKeyId"
              data-test="saved-api-key-select"
              class="input mb-2"
              @change="applySelectedSavedKey"
            >
              <option value="">{{ t('chatConsole.manualKey') }}</option>
              <option v-for="key in savedApiKeys" :key="key.id" :value="String(key.id)">
                {{ key.name }} - {{ key.group?.name || t('keys.noGroup') }}
              </option>
            </select>
            <input
              v-model="apiKey"
              class="input"
              type="password"
              autocomplete="off"
              :placeholder="t('chatConsole.apiKeyPlaceholder')"
            />
            <p class="input-hint">
              {{ savedApiKeyLoadError || t('chatConsole.apiKeyHint') }}
            </p>
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

          <div
            v-if="runType === 'image'"
            class="rounded-lg border border-gray-200 bg-gray-50/70 p-3 dark:border-dark-700 dark:bg-dark-800/60"
          >
            <div class="mb-3 flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white">
              <Icon name="sparkles" size="sm" class="text-primary-500" />
              {{ t('chatConsole.imageSettings.title') }}
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
              <div class="min-w-0">
                <label class="input-label">{{ t('chatConsole.imageSettings.model') }}</label>
                <input v-model="imageModel" data-test="image-model-input" class="input" autocomplete="off" list="spark-image-models" />
                <datalist id="spark-image-models">
                  <option v-for="option in imageModelOptions" :key="option" :value="option" />
                </datalist>
              </div>
              <div class="min-w-0">
                <label class="input-label">{{ t('chatConsole.imageSettings.size') }}</label>
                <select v-model="imageSize" data-test="image-size-select" class="input">
                  <option v-for="option in imageSizeOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </select>
              </div>
              <div class="min-w-0">
                <label class="input-label">{{ t('chatConsole.imageSettings.quality') }}</label>
                <select v-model="imageQuality" data-test="image-quality-select" class="input">
                  <option v-for="option in imageQualityOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </select>
              </div>
              <div class="min-w-0">
                <label class="input-label">{{ t('chatConsole.imageSettings.count') }}</label>
                <input v-model.number="imageCount" data-test="image-count-input" class="input" min="1" max="4" step="1" type="number" />
              </div>
              <div class="min-w-0">
                <label class="input-label">{{ t('chatConsole.imageSettings.background') }}</label>
                <select v-model="imageBackground" data-test="image-background-select" class="input">
                  <option v-for="option in imageBackgroundOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </select>
              </div>
              <div class="min-w-0">
                <label class="input-label">{{ t('chatConsole.imageSettings.responseFormat') }}</label>
                <select v-model="imageResponseFormat" data-test="image-response-format-select" class="input">
                  <option v-for="option in imageResponseFormatOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </select>
              </div>
              <div class="min-w-0">
                <label class="input-label">{{ t('chatConsole.imageSettings.outputFormat') }}</label>
                <select v-model="imageOutputFormat" data-test="image-output-format-select" class="input">
                  <option v-for="option in imageOutputFormatOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </select>
              </div>
              <div class="min-w-0">
                <label class="input-label">{{ t('chatConsole.imageSettings.compression') }}</label>
                <input
                  v-model.number="imageOutputCompression"
                  data-test="image-output-compression-input"
                  class="input"
                  min="0"
                  max="100"
                  step="5"
                  type="number"
                  :disabled="!usesImageCompression"
                />
              </div>
            </div>
            <p class="input-hint mt-2">{{ t('chatConsole.imageSettings.hint') }}</p>
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
          <div class="flex items-center justify-between gap-3">
            <label class="input-label mb-0">{{ t('chatConsole.tools.title') }}</label>
            <span class="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-dark-800 dark:text-dark-300">
              {{ selectedTools.length }}/{{ toolCatalog.length }}
            </span>
          </div>
          <div class="relative">
            <Icon name="search" size="sm" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              v-model="toolSearch"
              data-test="tool-search-input"
              class="input pl-9"
              autocomplete="off"
              :placeholder="t('chatConsole.tools.searchPlaceholder')"
            />
          </div>
          <div class="max-h-52 space-y-2 overflow-auto pr-1">
            <button
              v-for="tool in filteredToolCatalog"
              :key="tool.id"
              type="button"
              :data-test="`tool-toggle-${tool.id}`"
              class="w-full rounded-lg border px-3 py-2 text-left transition-colors"
              :class="isToolSelected(tool.id)
                ? 'border-primary-500 bg-primary-50 text-primary-900 dark:bg-primary-900/20 dark:text-primary-100'
                : 'border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-dark-700 dark:text-dark-200 dark:hover:bg-dark-800'"
              @click="toggleTool(tool.id)"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="truncate text-sm font-medium">{{ tool.name }}</span>
                <span
                  class="flex-shrink-0 rounded px-2 py-0.5 text-xs"
                  :class="tool.status === 'ready'
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-200'
                    : 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-200'"
                >
                  {{ t(`chatConsole.tools.status.${tool.status}`) }}
                </span>
              </div>
              <p class="mt-1 line-clamp-2 text-xs leading-5 text-gray-500 dark:text-dark-400">
                {{ tool.description }}
              </p>
            </button>
          </div>
          <p class="input-hint">{{ t('chatConsole.tools.hint') }}</p>
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

      <main class="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          v-if="isDragging"
          class="absolute inset-3 z-20 flex items-center justify-center rounded-lg border-2 border-dashed border-primary-400 bg-primary-50/95 text-primary-800 shadow-sm dark:border-primary-500 dark:bg-primary-950/95 dark:text-primary-100"
        >
          <div class="text-center">
            <Icon name="upload" size="lg" class="mx-auto mb-2" />
            <div class="text-sm font-semibold">{{ t('chatConsole.dropOverlayTitle') }}</div>
            <div class="mt-1 text-xs">{{ t('chatConsole.dropOverlayDescription') }}</div>
          </div>
        </div>

        <div ref="conversationRef" class="min-h-0 flex-1 space-y-4 overflow-auto p-4">
          <div
            v-for="message in visibleMessages"
            :key="message.id"
            class="flex"
            :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
          >
            <article
              class="max-w-[min(780px,94%)] rounded-lg border px-4 py-3 text-sm leading-6"
              :class="message.kind === 'error'
                ? 'border-red-200 bg-red-50 text-red-950 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-100'
                : message.role === 'user'
                ? 'border-primary-200 bg-primary-50 text-primary-950 dark:border-primary-900/50 dark:bg-primary-900/20 dark:text-primary-100'
                : 'border-gray-200 bg-gray-50 text-gray-800 dark:border-dark-700 dark:bg-dark-800 dark:text-dark-100'"
            >
              <div class="mb-2 flex items-center justify-between gap-3 text-xs font-medium text-gray-500 dark:text-dark-400">
                <div class="flex min-w-0 items-center gap-2 uppercase">
                  <span>
                    {{ message.kind === 'error' ? t('chatConsole.gatewayError') : message.role === 'user' ? t('chatConsole.you') : t('chatConsole.assistant') }}
                  </span>
                  <span v-if="message.status && message.kind !== 'error'" class="normal-case text-gray-400 dark:text-dark-500">
                    {{ t(`chatConsole.streamStatus.${message.status}`) }}
                  </span>
                </div>
                <div class="flex flex-shrink-0 items-center gap-2 normal-case">
                  <span v-if="messageElapsedText(message)" class="text-gray-400 dark:text-dark-500">
                    {{ messageElapsedText(message) }}
                  </span>
                  <button
                    v-if="message.role === 'assistant' && message.content"
                    type="button"
                    class="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-dark-700 dark:hover:text-dark-100"
                    :title="t('chatConsole.copyMessage')"
                    @click="copyMessageContent(message)"
                  >
                    <Icon name="copy" size="xs" />
                  </button>
                </div>
              </div>

              <div
                v-if="shouldShowActivity(message)"
                class="spark-chat-activity mb-3 rounded-md border border-gray-200 bg-white/80 px-3 py-3 shadow-sm dark:border-dark-700 dark:bg-dark-900/50"
              >
                <div class="flex items-start justify-between gap-3 text-xs">
                  <div class="flex min-w-0 items-start gap-3">
                    <span class="spark-chat-spinner" aria-hidden="true" />
                    <div class="min-w-0">
                      <div class="flex min-w-0 items-center gap-2 font-medium text-gray-800 dark:text-dark-100">
                        <span class="truncate">{{ activityTitle(message) }}</span>
                        <span v-if="message.streamedChars" class="spark-chat-live-dot" aria-hidden="true" />
                      </div>
                      <p class="mt-1 text-xs leading-5 text-gray-500 dark:text-dark-400">
                        {{ activityHint(message) }}
                      </p>
                    </div>
                  </div>
                  <span class="flex-shrink-0 rounded bg-gray-100 px-2 py-0.5 text-gray-500 dark:bg-dark-800 dark:text-dark-300">
                    {{ messageElapsedText(message) }}
                  </span>
                </div>
                <div class="mt-3 grid grid-cols-4 gap-1.5" :aria-label="t('chatConsole.activity.progressLabel')">
                  <span
                    v-for="step in streamStepOrder"
                    :key="step"
                    class="h-1.5 rounded-full transition-colors"
                    :class="streamStepClass(message, step)"
                    :title="t(`chatConsole.streamStatus.${step}`)"
                  />
                </div>
                <div v-if="showThinkingSkeleton(message)" class="spark-chat-skeleton mt-3 space-y-2" aria-hidden="true">
                  <span class="block h-2.5 w-11/12 rounded-full" />
                  <span class="block h-2.5 w-8/12 rounded-full" />
                  <span class="block h-2.5 w-5/12 rounded-full" />
                </div>
              </div>
              <div
                v-if="message.role === 'assistant'"
                class="spark-chat-markdown break-words"
                :class="[
                  message.content ? '' : 'text-gray-400 dark:text-dark-500',
                  isPendingAssistant(message) && message.content ? 'spark-chat-markdown-streaming' : ''
                ]"
                v-html="renderAssistantMessage(message)"
              />
              <div v-else class="whitespace-pre-wrap break-words">{{ message.content }}</div>
              <div v-if="message.images?.length" class="mt-3 grid gap-3 sm:grid-cols-2">
                <figure
                  v-for="(image, imageIndex) in message.images"
                  :key="`${message.id}-image-${imageIndex}`"
                  class="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-dark-700 dark:bg-dark-900"
                >
                  <img
                    :src="image.url"
                    :alt="image.revisedPrompt || t('chatConsole.imageResultAlt')"
                    class="aspect-square w-full object-cover"
                  />
                  <figcaption v-if="image.revisedPrompt || image.outputFormat || image.size" class="border-t border-gray-100 px-3 py-2 text-xs text-gray-500 dark:border-dark-700 dark:text-dark-400">
                    <div v-if="image.revisedPrompt">{{ image.revisedPrompt }}</div>
                    <div v-if="image.outputFormat || image.size" class="mt-1 flex flex-wrap gap-2 text-[11px] uppercase text-gray-400 dark:text-dark-500">
                      <span v-if="image.outputFormat">{{ image.outputFormat }}</span>
                      <span v-if="image.size">{{ image.size }}</span>
                      <span v-if="image.background">{{ image.background }}</span>
                    </div>
                  </figcaption>
                </figure>
              </div>
              <div
                v-if="message.role === 'assistant' && message.content && message.kind !== 'error'"
                class="mt-2 text-[11px] text-gray-400 dark:text-dark-500"
              >
                {{ t('chatConsole.outputMeta', { chars: message.content.length }) }}
              </div>
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
            <div v-if="attachments.length > 0" class="flex flex-wrap gap-2">
              <span
                v-for="file in attachments"
                :key="file.id"
                class="inline-flex max-w-full items-center gap-1 rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-600 dark:border-dark-700 dark:bg-dark-800 dark:text-dark-300"
              >
                <Icon name="document" size="xs" />
                <span class="max-w-[220px] truncate">{{ file.name }}</span>
                <button type="button" class="text-gray-400 hover:text-red-500" @click="removeAttachment(file.id)">
                  <Icon name="x" size="xs" />
                </button>
              </span>
            </div>
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
              <div class="flex flex-wrap items-center gap-2">
                <div class="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-xs dark:border-dark-700 dark:bg-dark-800">
                  <button
                    v-for="option in runTypeOptions"
                    :key="option.value"
                    type="button"
                    :data-test="`run-type-${option.value}`"
                    class="rounded-md px-2.5 py-1.5 transition-colors"
                    :class="runType === option.value
                      ? 'bg-white text-primary-700 shadow-sm dark:bg-dark-700 dark:text-primary-200'
                      : 'text-gray-500 hover:text-gray-800 dark:text-dark-300 dark:hover:text-white'"
                    :disabled="sending"
                    @click="runType = option.value"
                  >
                    {{ option.label }}
                  </button>
                </div>
                <button class="btn btn-primary" type="submit" :disabled="sending || !canSend">
                  {{ sending ? currentAssistantStatus : t('chatConsole.send') }}
                </button>
              </div>
            </div>
          </div>
        </form>
      </main>
    </div>
  </section>
</template>

<script setup lang="ts">
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  sendChatWorkbenchImageGeneration,
  sendChatWorkbenchMessageStream,
  type ChatWorkbenchError,
  type ChatWorkbenchGeneratedImage,
  type ChatWorkbenchMessage
} from '@/api/chatWorkbench'
import { accountsAPI } from '@/api/admin/accounts'
import { keysAPI } from '@/api/keys'
import Icon from '@/components/icons/Icon.vue'
import { useAppStore } from '@/stores/app'
import type { Account, ApiKey } from '@/types'

type WorkbenchMode = 'ops' | 'patch' | 'security' | 'ux'
type LayoutMode = 'split' | 'compact'
type RunType = 'chat' | 'image'
type StreamStatus = 'connecting' | 'waiting' | 'streaming' | 'finalizing'
type ActivityStage = StreamStatus | 'image-generating'

interface UiMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  kind?: 'normal' | 'error'
  status?: StreamStatus
  activityStage?: ActivityStage
  startedAt?: number
  updatedAt?: number
  completedAt?: number
  streamedChars?: number
  images?: ChatWorkbenchGeneratedImage[]
}

interface ChatAttachment {
  id: string
  name: string
  size: number
  content: string
  truncated: boolean
}

interface ChatSession {
  id: string
  title: string
  messages: UiMessage[]
  createdAt: string
  updatedAt: string
}

interface WorkbenchTool {
  id: string
  name: string
  category: 'skill' | 'mcp' | 'diagnostic'
  status: 'ready' | 'planned'
  description: string
  prompt: string
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
const maxSessions = 20
const accountPatrolLimit = 500
const streamStatusRank: Record<StreamStatus, number> = {
  connecting: 0,
  waiting: 1,
  streaming: 2,
  finalizing: 3
}
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
const requestUrl = ref(localStorage.getItem(`${props.storageKey}_request_url`) || '/v1/chat/completions')
const model = ref(localStorage.getItem(`${props.storageKey}_model`) || 'gpt-5.4')
const temperature = ref(0.2)
const imageModel = ref(localStorage.getItem(`${props.storageKey}_image_model`) || 'gpt-image-2')
const imageSize = ref(localStorage.getItem(`${props.storageKey}_image_size`) || '1024x1024')
const imageQuality = ref(localStorage.getItem(`${props.storageKey}_image_quality`) || 'auto')
const imageCount = ref(Number(localStorage.getItem(`${props.storageKey}_image_count`) || '1'))
const imageBackground = ref(localStorage.getItem(`${props.storageKey}_image_background`) || 'auto')
const imageResponseFormat = ref(localStorage.getItem(`${props.storageKey}_image_response_format`) || 'auto')
const imageOutputFormat = ref(localStorage.getItem(`${props.storageKey}_image_output_format`) || 'auto')
const imageOutputCompression = ref(Number(localStorage.getItem(`${props.storageKey}_image_output_compression`) || '80'))
const mode = ref<WorkbenchMode>(props.defaultMode)
const runType = ref<RunType>('chat')
const projectContext = ref('')
const draft = ref('')
const sending = ref(false)
const nowTick = ref(Date.now())
const isDragging = ref(false)
const dragDepth = ref(0)
const messages = ref<UiMessage[]>([])
const sessions = ref<ChatSession[]>([])
const activeSessionId = ref('')
const attachments = ref<ChatAttachment[]>([])
const conversationRef = ref<HTMLElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const savedApiKeys = ref<ApiKey[]>([])
const selectedSavedKeyId = ref('')
const savedApiKeyLoadError = ref('')
const toolSearch = ref('')
const selectedToolIds = ref<string[]>([])
let nowIntervalId: number | undefined

const modeOptions = computed(() => [
  { value: 'ops' as const, label: t('chatConsole.modes.ops') },
  { value: 'patch' as const, label: t('chatConsole.modes.patch') },
  { value: 'security' as const, label: t('chatConsole.modes.security') },
  { value: 'ux' as const, label: t('chatConsole.modes.ux') }
])
const runTypeOptions = computed(() => [
  { value: 'chat' as const, label: t('chatConsole.runTypes.chat') },
  { value: 'image' as const, label: t('chatConsole.runTypes.image') }
])
const imageModelOptions = ['gpt-image-2', 'gpt-image-1', 'dall-e-3']
const imageSizeOptions = computed(() => [
  { value: 'auto', label: String(t('chatConsole.imageSettings.auto')) },
  { value: '1024x1024', label: '1024 x 1024' },
  { value: '1024x1536', label: '1024 x 1536' },
  { value: '1536x1024', label: '1536 x 1024' },
  { value: '2048x2048', label: '2048 x 2048' },
  { value: '2048x1152', label: '2048 x 1152' },
  { value: '3840x2160', label: '3840 x 2160' },
  { value: '2160x3840', label: '2160 x 3840' }
])
const imageQualityOptions = computed(() => [
  { value: 'auto', label: String(t('chatConsole.imageSettings.auto')) },
  { value: 'low', label: String(t('chatConsole.imageSettings.low')) },
  { value: 'medium', label: String(t('chatConsole.imageSettings.medium')) },
  { value: 'high', label: String(t('chatConsole.imageSettings.high')) }
])
const imageBackgroundOptions = computed(() => [
  { value: 'auto', label: String(t('chatConsole.imageSettings.auto')) },
  { value: 'opaque', label: String(t('chatConsole.imageSettings.opaque')) },
  { value: 'transparent', label: String(t('chatConsole.imageSettings.transparent')) }
])
const imageResponseFormatOptions = computed(() => [
  { value: 'auto', label: String(t('chatConsole.imageSettings.auto')) },
  { value: 'b64_json', label: 'Base64 JSON' },
  { value: 'url', label: 'URL' }
])
const imageOutputFormatOptions = computed(() => [
  { value: 'auto', label: String(t('chatConsole.imageSettings.auto')) },
  { value: 'png', label: 'PNG' },
  { value: 'jpeg', label: 'JPEG' },
  { value: 'webp', label: 'WebP' }
])
const streamStepOrder: StreamStatus[] = ['connecting', 'waiting', 'streaming', 'finalizing']

const visibleMessages = computed(() => messages.value)
const currentAssistantStatus = computed(() => {
  const activeAssistant = [...messages.value].reverse().find((message) => message.role === 'assistant' && message.status)
  return activeAssistant?.status
    ? String(t(`chatConsole.streamStatus.${activeAssistant.status}`))
    : String(t('chatConsole.sending'))
})
const canSend = computed(() => (
  apiKey.value.trim() !== '' &&
  model.value.trim() !== '' &&
  (draft.value.trim() !== '' || attachments.value.length > 0)
))
const usesImageCompression = computed(() => ['jpeg', 'webp'].includes(imageOutputFormat.value))
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
const sessionsStorageKey = computed(() => `${props.storageKey}_sessions`)
const toolCatalog = computed<WorkbenchTool[]>(() => [
  {
    id: 'gateway-diagnostics',
    name: String(t('chatConsole.tools.gatewayDiagnostics.name')),
    category: 'diagnostic',
    status: 'ready',
    description: String(t('chatConsole.tools.gatewayDiagnostics.description')),
    prompt: 'Use SparkAPI gateway diagnostics: inspect endpoint, model route, account pool, proxy connectivity, upstream response code, and rollback steps. Prefer non-destructive checks first.'
  },
  {
    id: 'account-patrol',
    name: String(t('chatConsole.tools.accountPatrol.name')),
    category: 'diagnostic',
    status: 'ready',
    description: String(t('chatConsole.tools.accountPatrol.description')),
    prompt: 'Use SparkAPI account patrol mode. Start from the included read-only account snapshot. Diagnose by group, platform, proxy, schedulability, error status, rate-limit windows, and last-used freshness. Reference the Linux.do workflow idea safely: CPA-to-sub2api JSON conversion, group import, batch testing, and automated cleanup must be explicit, reversible, and never executed from browser chat.'
  },
  {
    id: 'skill-search',
    name: String(t('chatConsole.tools.skillSearch.name')),
    category: 'skill',
    status: 'ready',
    description: String(t('chatConsole.tools.skillSearch.description')),
    prompt: 'Use SparkAPI skill search mode: identify the best local agent skill/workflow for the task, explain why it fits, and provide a safe invocation plan. Do not claim a skill was executed unless the operator actually ran it.'
  },
  {
    id: 'mcp-catalog',
    name: String(t('chatConsole.tools.mcpCatalog.name')),
    category: 'mcp',
    status: 'planned',
    description: String(t('chatConsole.tools.mcpCatalog.description')),
    prompt: 'Use MCP connector catalog mode. Treat MCP access as admin-only and allowlisted. Recommend read-only connector calls first, never arbitrary shell execution, and clearly mark actions that require a server-side MCP bridge.'
  },
  {
    id: 'patch-review',
    name: String(t('chatConsole.tools.patchReview.name')),
    category: 'skill',
    status: 'ready',
    description: String(t('chatConsole.tools.patchReview.description')),
    prompt: 'Use patch review mode: propose minimal diffs, regression tests, verification commands, and rollback notes for SparkAPI changes.'
  },
  {
    id: 'image-generation',
    name: String(t('chatConsole.tools.imageGeneration.name')),
    category: 'skill',
    status: 'ready',
    description: String(t('chatConsole.tools.imageGeneration.description')),
    prompt: 'Use SparkAPI image generation mode. When the operator asks for images, route through /v1/images/generations with a gpt-image model, check group image permission, image billing tier, and proxy/upstream availability before retrying.'
  }
])
const filteredToolCatalog = computed(() => {
  const query = toolSearch.value.trim().toLowerCase()
  if (!query) return toolCatalog.value
  return toolCatalog.value.filter((tool) => [
    tool.name,
    tool.category,
    tool.description,
    tool.prompt
  ].some((value) => value.toLowerCase().includes(query)))
})
const selectedTools = computed(() => (
  selectedToolIds.value
    .map((id) => toolCatalog.value.find((tool) => tool.id === id))
    .filter((tool): tool is WorkbenchTool => Boolean(tool))
))

watch(apiKey, (value) => {
  if (value) {
    sessionStorage.setItem(`${props.storageKey}_api_key`, value)
  } else {
    sessionStorage.removeItem(`${props.storageKey}_api_key`)
  }
})

watch(requestUrl, (value) => {
  localStorage.setItem(`${props.storageKey}_request_url`, value.trim() || '/v1/chat/completions')
})

watch(model, (value) => {
  localStorage.setItem(`${props.storageKey}_model`, value)
})

watch(imageModel, (value) => {
  localStorage.setItem(`${props.storageKey}_image_model`, value)
})

watch(imageSize, (value) => {
  localStorage.setItem(`${props.storageKey}_image_size`, value)
})

watch(imageQuality, (value) => {
  localStorage.setItem(`${props.storageKey}_image_quality`, value)
})

watch(imageCount, (value) => {
  const safeCount = clampImageCount(value)
  if (safeCount !== value) {
    imageCount.value = safeCount
    return
  }
  localStorage.setItem(`${props.storageKey}_image_count`, String(safeCount))
})

watch(imageBackground, (value) => {
  localStorage.setItem(`${props.storageKey}_image_background`, value)
})

watch(imageResponseFormat, (value) => {
  localStorage.setItem(`${props.storageKey}_image_response_format`, value)
})

watch(imageOutputFormat, (value) => {
  localStorage.setItem(`${props.storageKey}_image_output_format`, value)
})

watch(imageOutputCompression, (value) => {
  const safeCompression = clampImageCompression(value)
  if (safeCompression !== value) {
    imageOutputCompression.value = safeCompression
    return
  }
  localStorage.setItem(`${props.storageKey}_image_output_compression`, String(safeCompression))
})

onMounted(() => {
  nowIntervalId = window.setInterval(() => {
    nowTick.value = Date.now()
  }, 1000)
  loadSessions()
  loadSavedApiKeys()
})

onUnmounted(() => {
  if (nowIntervalId !== undefined) {
    window.clearInterval(nowIntervalId)
  }
})

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatSessionTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString()
}

function formatElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return ''
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${minutes}m ${rest}s`
}

function messageElapsedText(message: UiMessage): string {
  if (!message.startedAt) return ''
  const end = message.completedAt || message.updatedAt || nowTick.value
  return formatElapsed(end - message.startedAt)
}

function clampImageCount(value: unknown): number {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return 1
  return Math.min(4, Math.max(1, Math.round(numberValue)))
}

function clampImageCompression(value: unknown): number {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return 80
  return Math.min(100, Math.max(0, Math.round(numberValue)))
}

function isPendingAssistant(message: UiMessage): boolean {
  return message.role === 'assistant' && message.kind !== 'error' && Boolean(message.status || message.activityStage)
}

function shouldShowActivity(message: UiMessage): boolean {
  return isPendingAssistant(message)
}

function showThinkingSkeleton(message: UiMessage): boolean {
  return isPendingAssistant(message) && !message.content.trim()
}

function activityTitle(message: UiMessage): string {
  if (message.activityStage === 'image-generating') {
    return String(t('chatConsole.activity.imageGenerating'))
  }
  const status = message.status || 'connecting'
  if (status === 'streaming' && (message.streamedChars || 0) > 0) {
    return String(t('chatConsole.activity.streamingWithChars', { chars: message.streamedChars || 0 }))
  }
  return String(t(`chatConsole.activity.${status}`))
}

function activityHint(message: UiMessage): string {
  if (message.activityStage === 'image-generating') {
    return String(t('chatConsole.activity.imageHint'))
  }
  const status = message.status || 'connecting'
  if (status === 'waiting') {
    return String(t('chatConsole.activity.waitingHint'))
  }
  if (status === 'streaming') {
    return (message.streamedChars || 0) > 0
      ? String(t('chatConsole.activity.streamingHint'))
      : String(t('chatConsole.activity.streamingEmptyHint'))
  }
  return String(t('chatConsole.activity.defaultHint'))
}

function streamStepClass(message: UiMessage, step: StreamStatus): string {
  const status = message.status || (message.activityStage === 'image-generating' ? 'streaming' : 'connecting')
  const activeRank = streamStatusRank[status] ?? 0
  const stepRank = streamStatusRank[step]
  if (stepRank < activeRank) return 'bg-primary-400 dark:bg-primary-500'
  if (stepRank === activeRank) return 'bg-primary-600 dark:bg-primary-300'
  return 'bg-gray-200 dark:bg-dark-700'
}

function buildSessionTitle(content: string): string {
  const text = content.trim().replace(/\s+/g, ' ')
  if (!text) return String(t('chatConsole.untitledChat'))
  return text.length > 36 ? `${text.slice(0, 36)}...` : text
}

function loadSessions() {
  try {
    const raw = localStorage.getItem(sessionsStorageKey.value)
    const parsed = raw ? JSON.parse(raw) : []
    if (Array.isArray(parsed)) {
      sessions.value = parsed
        .filter((session) => session && typeof session.id === 'string' && Array.isArray(session.messages))
        .slice(0, maxSessions)
    }
  } catch {
    sessions.value = []
  }

  if (sessions.value.length > 0) {
    selectSession(sessions.value[0].id)
  }
}

function persistSessions() {
  localStorage.setItem(sessionsStorageKey.value, JSON.stringify(sessions.value.slice(0, maxSessions)))
}

function createNewSession() {
  if (sending.value) return
  activeSessionId.value = ''
  messages.value = []
  attachments.value = []
}

function selectSession(id: string) {
  const session = sessions.value.find((item) => item.id === id)
  if (!session || sending.value) return
  activeSessionId.value = session.id
  messages.value = session.messages.map((message) => ({ ...message }))
  attachments.value = []
  scrollToBottom()
}

function upsertActiveSession() {
  const now = new Date().toISOString()
  if (messages.value.length === 0) return

  const firstUserMessage = messages.value.find((message) => message.role === 'user')
  const title = buildSessionTitle(firstUserMessage?.content || '')
  const snapshot = messages.value.map((message) => ({
    ...message,
    status: undefined,
    activityStage: undefined
  }))
  const existingIndex = sessions.value.findIndex((session) => session.id === activeSessionId.value)

  if (existingIndex >= 0) {
    const existing = sessions.value[existingIndex]
    sessions.value.splice(existingIndex, 1)
    sessions.value.unshift({
      ...existing,
      title,
      messages: snapshot,
      updatedAt: now
    })
    activeSessionId.value = existing.id
  } else {
    const id = `session-${Date.now()}-${Math.random().toString(16).slice(2)}`
    sessions.value.unshift({
      id,
      title,
      messages: snapshot,
      createdAt: now,
      updatedAt: now
    })
    activeSessionId.value = id
  }

  sessions.value = sessions.value.slice(0, maxSessions)
  persistSessions()
}

async function loadSavedApiKeys() {
  try {
    const result = await keysAPI.list(1, 50, { status: 'active', sort_by: 'created_at', sort_order: 'desc' })
    savedApiKeys.value = result.items || []
    savedApiKeyLoadError.value = ''
  } catch (error: any) {
    savedApiKeys.value = []
    const status = Number(error?.status || error?.response?.status || 0)
    savedApiKeyLoadError.value = status === 401 || status === 403
      ? ''
      : String(t('chatConsole.savedKeysUnavailable'))
  }
}

function applySelectedSavedKey() {
  const id = Number(selectedSavedKeyId.value)
  const selected = savedApiKeys.value.find((key) => key.id === id)
  if (!selected) return
  apiKey.value = selected.key
}

function isToolSelected(id: string): boolean {
  return selectedToolIds.value.includes(id)
}

function toggleTool(id: string) {
  if (isToolSelected(id)) {
    selectedToolIds.value = selectedToolIds.value.filter((item) => item !== id)
    return
  }
  selectedToolIds.value = [...selectedToolIds.value, id]
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
  dragDepth.value = 0
  isDragging.value = false
  addFiles(Array.from(event.dataTransfer?.files || []))
}

function handleConsoleDragEnter() {
  dragDepth.value += 1
  isDragging.value = true
}

function handleConsoleDragOver() {
  isDragging.value = true
}

function handleConsoleDragLeave() {
  dragDepth.value = Math.max(0, dragDepth.value - 1)
  if (dragDepth.value === 0) {
    isDragging.value = false
  }
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

function buildToolContext(): string {
  if (selectedTools.value.length === 0) return ''

  const lines = selectedTools.value.map((tool) => [
    `- ${tool.name} [${tool.category}/${tool.status}]`,
    `  ${tool.prompt}`
  ].join('\n'))

  return [
    'Selected SparkAPI workbench tools:',
    ...lines
  ].join('\n')
}

function buildCompletedHistorySnapshot(): UiMessage[] {
  return messages.value
    .filter((message) => {
      if (!message.content.trim()) return false
      if (message.kind === 'error') return false
      if (message.role === 'assistant' && (message.status || message.activityStage)) return false
      return true
    })
    .map((message) => ({ ...message }))
}

function groupNames(account: Account): string[] {
  if (Array.isArray(account.groups) && account.groups.length > 0) {
    return account.groups
      .map((group) => group?.name || (group?.id ? `#${group.id}` : ''))
      .filter(Boolean)
  }

  if (Array.isArray(account.group_ids) && account.group_ids.length > 0) {
    return account.group_ids.map((id) => `#${id}`)
  }

  return ['Unassigned']
}

function summarizeAccountPatrolSnapshot(accounts: Account[], total: number): string {
  const byStatus = new Map<string, number>()
  const byPlatform = new Map<string, number>()
  const byProxy = new Map<string, { total: number, error: number, unschedulable: number }>()
  const byGroup = new Map<string, { total: number, error: number, unschedulable: number }>()
  const notable: string[] = []

  for (const account of accounts) {
    byStatus.set(account.status, (byStatus.get(account.status) || 0) + 1)
    byPlatform.set(account.platform, (byPlatform.get(account.platform) || 0) + 1)
    const proxyKey = account.proxy_id == null ? 'none' : `#${account.proxy_id}`
    const proxyStats = byProxy.get(proxyKey) || { total: 0, error: 0, unschedulable: 0 }
    proxyStats.total += 1
    if (account.status === 'error') proxyStats.error += 1
    if (account.schedulable === false) proxyStats.unschedulable += 1
    byProxy.set(proxyKey, proxyStats)

    for (const name of groupNames(account)) {
      const current = byGroup.get(name) || { total: 0, error: 0, unschedulable: 0 }
      current.total += 1
      if (account.status === 'error') current.error += 1
      if (account.schedulable === false) current.unschedulable += 1
      byGroup.set(name, current)
    }

    const reasons = [
      account.status === 'error' ? 'status=error' : '',
      account.schedulable === false ? 'unschedulable' : '',
      account.rate_limited_at ? `rate_limited_at=${account.rate_limited_at}` : '',
      account.overload_until ? `overload_until=${account.overload_until}` : '',
      account.temp_unschedulable_until ? `temp_unschedulable_until=${account.temp_unschedulable_until}` : '',
      account.error_message ? `error=${account.error_message}` : ''
    ].filter(Boolean)

    if (reasons.length > 0 && notable.length < 20) {
      notable.push([
        `#${account.id} ${account.name}`,
        `platform=${account.platform}`,
        `type=${account.type}`,
        `groups=${groupNames(account).join(',')}`,
        `proxy=${account.proxy_id ?? 'none'}`,
        `last_used=${account.last_used_at || 'never'}`,
        reasons.join('; ')
      ].join(' | '))
    }
  }

  const formatMap = (map: Map<string, number>) => (
    Array.from(map.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([key, count]) => `${key}=${count}`)
      .join(', ') || 'none'
  )

  const groupLines = Array.from(byGroup.entries())
    .sort((a, b) => b[1].error - a[1].error || b[1].unschedulable - a[1].unschedulable || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([name, stats]) => `- Group ${name}: total=${stats.total}, error=${stats.error}, unschedulable=${stats.unschedulable}`)

  const proxyLines = Array.from(byProxy.entries())
    .sort((a, b) => b[1].error - a[1].error || b[1].unschedulable - a[1].unschedulable || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([name, stats]) => `- Proxy ${name}: total=${stats.total}, error=${stats.error}, unschedulable=${stats.unschedulable}`)

  return [
    'SparkAPI account patrol snapshot (read-only):',
    `Total accounts: ${total}`,
    `Sampled accounts: ${accounts.length}${total > accounts.length ? ` of ${total}` : ''}`,
    `By status: ${formatMap(byStatus)}`,
    `By platform: ${formatMap(byPlatform)}`,
    'Group risk summary:',
    ...(groupLines.length > 0 ? groupLines : ['- none']),
    'Proxy risk summary:',
    ...(proxyLines.length > 0 ? proxyLines : ['- none']),
    'Notable accounts:',
    ...(notable.length > 0 ? notable.map((line) => `- ${line}`) : ['- none']),
    'Patrol playbook: first segment by group/platform/proxy/status, then test a small sample, then run bounded grouped checks with explicit concurrency and timeout, then quarantine or cleanup only after an operator confirms the exact reversible action.',
    'Patrol constraints: do not delete, disable, clear errors, refresh credentials, or run batch tests unless the operator explicitly confirms a backend action. Auto-disable and auto-delete must be mutually exclusive. Prefer staged plan: filter -> sample test -> grouped test -> quarantine -> reversible cleanup.'
  ].join('\n')
}

function createTimeoutSignal(timeoutMs: number): AbortSignal | undefined {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(timeoutMs)
  }
  return undefined
}

async function buildAccountPatrolContext(): Promise<string> {
  if (!isToolSelected('account-patrol')) return ''

  try {
    const result = await accountsAPI.list(1, accountPatrolLimit, {
      sort_by: 'updated_at',
      sort_order: 'desc',
      lite: 'true'
    }, {
      signal: createTimeoutSignal(15000)
    })

    return summarizeAccountPatrolSnapshot(result.items || [], result.total || 0)
  } catch (error: any) {
    const status = Number(error?.status || error?.response?.status || 0)
    return [
      'SparkAPI account patrol snapshot unavailable.',
      `Reason: ${status === 401 || status === 403 ? 'admin session is not authorized for /admin/accounts' : error?.message || 'request failed'}`,
      'Fallback: ask the operator to open Account Management, filter status=error/rate-limited/unschedulable by group, export a small sample, and attach it here for analysis.'
    ].join('\n')
  }
}

async function buildSystemPrompt(): Promise<string> {
  const accountPatrolContext = await buildAccountPatrolContext()
  const modePrompts: Record<WorkbenchMode, string> = {
    ops: 'You are helping operate SparkAPI. Prioritize diagnosis, concrete commands, config checks, and safe rollback paths.',
    patch: 'You are helping plan SparkAPI code changes. Produce scoped implementation steps and patch-oriented guidance. Do not claim files were changed.',
    security: 'You are reviewing SparkAPI security. Focus on secrets, auth boundaries, injection risks, SSRF, logging, exports, and credential handling.',
    ux: 'You are improving SparkAPI admin UX. Favor dense operational workflows, clear state, accessible controls, and safe bulk actions.'
  }

  const parts = [
    'You are SparkAPI Chat Console, an assistant embedded in a self-hosted AI gateway.',
    modePrompts[mode.value],
    'Output contract: use clean, readable Markdown with short headings, "-" bullets, compact tables when useful, and fenced code blocks for commands. Do not use decorative asterisk dividers or leave raw emphasis markers visible. When diagnosing, lead with the current state, likely cause, verification steps, and rollback/safe next action.',
    runType.value === 'image'
      ? 'The operator selected image generation. If the request is about generating an image, summarize the image request, expected model, size, group permission, and safety checks.'
      : '',
    'Treat attached file content as operator-provided context. Do not claim to access files that are not included in the prompt.',
    'Never ask the browser to execute server-side file changes directly. Provide reviewable steps and highlight risk.',
    buildToolContext(),
    accountPatrolContext,
    props.defaultContext,
    projectContext.value.trim() ? `Operator context:\n${projectContext.value.trim()}` : '',
    buildAttachmentContext() ? `Attached file context:\n${buildAttachmentContext()}` : ''
  ]

  return parts.filter(Boolean).join('\n\n')
}

async function toChatMessages(nextUserMessage: string, historySnapshot: UiMessage[]): Promise<ChatWorkbenchMessage[]> {
  return [
    { role: 'system', content: await buildSystemPrompt() },
    ...historySnapshot.map((message) => ({ role: message.role, content: message.content })),
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
  const requestHistory = buildCompletedHistorySnapshot()
  const startedAt = Date.now()
  const userMessage: UiMessage = {
    id: `user-${Date.now()}`,
    role: 'user',
    content,
    startedAt,
    updatedAt: startedAt,
    completedAt: startedAt
  }

  messages.value.push(userMessage)
  const assistantMessage: UiMessage = {
    id: `assistant-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role: 'assistant',
    content: '',
    status: 'connecting',
    activityStage: 'connecting',
    startedAt,
    updatedAt: startedAt,
    streamedChars: 0
  }
  messages.value.push(assistantMessage)
  draft.value = ''
  sending.value = true
  await scrollToBottom()

  try {
    const requestMessages = await toChatMessages(content, requestHistory)

    if (runType.value === 'image') {
      assistantMessage.content = String(t('chatConsole.imageGenerating'))
      assistantMessage.activityStage = 'image-generating'
      assistantMessage.status = 'streaming'
      assistantMessage.updatedAt = Date.now()
      const selectedImageModel = normalizeImageModel(imageModel.value || model.value)
      const supportsAdvancedImageParams = selectedImageModel.toLowerCase().startsWith('gpt-image')
      const imageResponse = await sendChatWorkbenchImageGeneration({
        apiKey: apiKey.value.trim(),
        baseUrl: normalizeImagesRequestUrl(requestUrl.value),
        model: selectedImageModel,
        prompt: content,
        size: imageSize.value,
        quality: imageQuality.value,
        n: clampImageCount(imageCount.value),
        background: supportsAdvancedImageParams ? normalizeImageBackground(selectedImageModel) : 'auto',
        responseFormat: normalizeImageResponseFormat(selectedImageModel),
        outputFormat: supportsAdvancedImageParams ? imageOutputFormat.value as 'auto' | 'png' | 'jpeg' | 'webp' : 'auto',
        outputCompression: supportsAdvancedImageParams && usesImageCompression.value ? clampImageCompression(imageOutputCompression.value) : undefined
      })
      assistantMessage.content = String(t('chatConsole.imageGenerated', { count: imageResponse.images.length }))
      assistantMessage.images = imageResponse.images
      assistantMessage.status = undefined
      assistantMessage.activityStage = undefined
      assistantMessage.completedAt = Date.now()
      assistantMessage.updatedAt = assistantMessage.completedAt
    } else {
      const response = await sendChatWorkbenchMessageStream({
        apiKey: apiKey.value.trim(),
        baseUrl: requestUrl.value.trim() || '/v1/chat/completions',
        model: model.value.trim(),
        temperature: temperature.value,
        messages: requestMessages,
        maxTokens: 2000
      }, {
        onStatus: (status) => {
          assistantMessage.status = status
          assistantMessage.activityStage = status
          assistantMessage.updatedAt = Date.now()
        },
        onDelta: (delta) => {
          assistantMessage.content += normalizeAssistantOutputDelta(delta)
          assistantMessage.streamedChars = assistantMessage.content.length
          assistantMessage.updatedAt = Date.now()
          scrollToBottom()
        }
      })
      assistantMessage.content = normalizeAssistantOutput(response.content || assistantMessage.content)
      assistantMessage.status = undefined
      assistantMessage.activityStage = undefined
      assistantMessage.completedAt = Date.now()
      assistantMessage.updatedAt = assistantMessage.completedAt
      assistantMessage.streamedChars = assistantMessage.content.length
    }
    upsertActiveSession()
    await scrollToBottom()
  } catch (error: any) {
    const errorContent = formatChatError(error)
    assistantMessage.kind = 'error'
    assistantMessage.content = errorContent
    assistantMessage.status = undefined
    assistantMessage.activityStage = undefined
    assistantMessage.completedAt = Date.now()
    assistantMessage.updatedAt = assistantMessage.completedAt
    assistantMessage.images = undefined
    appStore.showError(error?.message || t('chatConsole.sendFailed'))
    await scrollToBottom()
  } finally {
    sending.value = false
  }
}

function normalizeImageModel(value: string): string {
  const current = value.trim()
  return current || 'gpt-image-2'
}

function normalizeImageBackground(imageModelName: string): 'auto' | 'opaque' | 'transparent' {
  if (imageModelName.toLowerCase() === 'gpt-image-2' && imageBackground.value === 'transparent') {
    return 'auto'
  }
  return imageBackground.value as 'auto' | 'opaque' | 'transparent'
}

function normalizeImageResponseFormat(imageModelName: string): 'auto' | 'b64_json' | 'url' {
  if (imageModelName.toLowerCase().startsWith('gpt-image') && imageResponseFormat.value === 'url') {
    return 'auto'
  }
  return imageResponseFormat.value as 'auto' | 'b64_json' | 'url'
}

function normalizeImagesRequestUrl(value: string): string {
  const current = value.trim()
  if (!current || current === '/v1/chat/completions') {
    return '/v1/images/generations'
  }
  return current
    .replace(/\/v1\/chat\/completions$/, '/v1/images/generations')
    .replace(/\/chat\/completions$/, '/images/generations')
}

function formatChatError(error: unknown): string {
  if (error && typeof error === 'object' && ('status' in error || 'upstreamMessage' in error)) {
    const detail = error as Partial<ChatWorkbenchError>
    const lines = [
      `${t('chatConsole.gatewayErrorStatus')}: ${detail.status || 'unknown'}`,
      `${t('chatConsole.gatewayErrorEndpoint')}: ${detail.endpoint || requestUrl.value.trim() || '/v1/chat/completions'}`,
      `${t('chatConsole.gatewayErrorModel')}: ${detail.model || model.value.trim() || 'unknown'}`,
      `${t('chatConsole.gatewayErrorCause')}: ${detail.upstreamMessage || detail.message || t('chatConsole.sendFailed')}`,
      '',
      String(t('chatConsole.gatewayErrorAdvice'))
    ]
    return lines.join('\n')
  }

  return `${t('chatConsole.sendFailed')}: ${error instanceof Error ? error.message : String(error || '')}`
}

async function copyMessageContent(message: UiMessage) {
  try {
    await navigator.clipboard.writeText(message.content)
    appStore.showSuccess(t('chatConsole.copied'))
  } catch {
    appStore.showError(t('chatConsole.copyFailed'))
  }
}

function resetConversation() {
  if (sending.value) return
  messages.value = []
  activeSessionId.value = ''
}

function normalizeAssistantOutputDelta(delta: string): string {
  return delta.split('\u0000').join('')
}

function normalizeAssistantOutput(content: string): string {
  return content
    .split('\u0000').join('')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

function maskIncompleteMarkdown(content: string): string {
  let next = content
  const fenceCount = (next.match(/```/g) || []).length
  if (fenceCount % 2 === 1) {
    next += '\n```'
  }

  const boldCount = (next.match(/\*\*/g) || []).length
  if (boldCount % 2 === 1) {
    next += '**'
  }

  const inlineCodeCount = (next.match(/(?<!`)`(?!`)/g) || []).length
  if (inlineCodeCount % 2 === 1) {
    next += '`'
  }

  return next
}

function renderAssistantMessage(message: UiMessage): string {
  if (!message.content && message.status) {
    return DOMPurify.sanitize(`<p>${activityTitle(message)}</p>`)
  }

  const html = marked.parse(maskIncompleteMarkdown(message.content || ''), {
    async: false,
    breaks: true
  }) as string
  return DOMPurify.sanitize(html)
}

function handleDraftKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault()
    sendMessage()
  }
}
</script>

<style scoped>
.spark-chat-markdown :deep(p) {
  margin: 0 0 0.75rem;
}

.spark-chat-markdown :deep(p:last-child),
.spark-chat-markdown :deep(ul:last-child),
.spark-chat-markdown :deep(ol:last-child),
.spark-chat-markdown :deep(pre:last-child) {
  margin-bottom: 0;
}

.spark-chat-markdown :deep(ul),
.spark-chat-markdown :deep(ol) {
  margin: 0 0 0.75rem 1.25rem;
  padding: 0;
}

.spark-chat-markdown :deep(ul) {
  list-style: disc;
}

.spark-chat-markdown :deep(ol) {
  list-style: decimal;
}

.spark-chat-markdown :deep(li + li) {
  margin-top: 0.25rem;
}

.spark-chat-markdown :deep(code) {
  border-radius: 0.25rem;
  background: rgb(229 231 235 / 0.75);
  padding: 0.1rem 0.3rem;
  font-size: 0.85em;
}

.dark .spark-chat-markdown :deep(code) {
  background: rgb(31 41 55 / 0.8);
}

.spark-chat-markdown :deep(pre) {
  margin: 0 0 0.75rem;
  overflow-x: auto;
  border-radius: 0.5rem;
  background: rgb(17 24 39);
  padding: 0.75rem;
  color: rgb(243 244 246);
}

.spark-chat-markdown :deep(pre code) {
  background: transparent;
  padding: 0;
  color: inherit;
}

.spark-chat-markdown :deep(a) {
  color: rgb(37 99 235);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.spark-chat-activity {
  position: relative;
  overflow: hidden;
}

.spark-chat-activity::before {
  content: '';
  position: absolute;
  inset-block-start: 0;
  inset-inline: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, rgb(37 99 235 / 0.65), transparent);
  transform: translateX(-100%);
  animation: spark-chat-scan 1.8s ease-in-out infinite;
}

.spark-chat-spinner {
  position: relative;
  display: inline-block;
  width: 1rem;
  height: 1rem;
  margin-top: 0.125rem;
  flex-shrink: 0;
  border-radius: 9999px;
  border: 2px solid rgb(209 213 219);
  border-top-color: rgb(37 99 235);
  animation: spark-chat-spin 0.9s linear infinite;
}

.spark-chat-spinner::after {
  content: '';
  position: absolute;
  inset: 0.1875rem;
  border-radius: inherit;
  background: rgb(37 99 235 / 0.24);
  animation: spark-chat-pulse 1.3s ease-in-out infinite;
}

.spark-chat-live-dot {
  width: 0.375rem;
  height: 0.375rem;
  flex-shrink: 0;
  border-radius: 9999px;
  background: rgb(16 185 129);
  box-shadow: 0 0 0 0 rgb(16 185 129 / 0.45);
  animation: spark-chat-live 1.2s ease-out infinite;
}

.spark-chat-skeleton span {
  background: linear-gradient(90deg, rgb(229 231 235 / 0.8), rgb(243 244 246), rgb(229 231 235 / 0.8));
  background-size: 220% 100%;
  animation: spark-chat-skeleton 1.4s ease-in-out infinite;
}

.spark-chat-markdown-streaming :deep(p:last-child)::after,
.spark-chat-markdown-streaming :deep(li:last-child)::after {
  content: '';
  display: inline-block;
  width: 0.45rem;
  height: 1em;
  margin-left: 0.2rem;
  border-radius: 1px;
  background: rgb(37 99 235 / 0.7);
  vertical-align: -0.12em;
  animation: spark-chat-cursor 0.9s step-end infinite;
}

.dark .spark-chat-spinner {
  border-color: rgb(55 65 81);
  border-top-color: rgb(147 197 253);
}

.dark .spark-chat-spinner::after {
  background: rgb(147 197 253 / 0.22);
}

.dark .spark-chat-skeleton span {
  background: linear-gradient(90deg, rgb(55 65 81 / 0.75), rgb(75 85 99 / 0.75), rgb(55 65 81 / 0.75));
  background-size: 220% 100%;
}

.dark .spark-chat-markdown-streaming :deep(p:last-child)::after,
.dark .spark-chat-markdown-streaming :deep(li:last-child)::after {
  background: rgb(147 197 253 / 0.75);
}

@media (prefers-reduced-motion: reduce) {
  .spark-chat-activity::before,
  .spark-chat-spinner,
  .spark-chat-spinner::after,
  .spark-chat-live-dot,
  .spark-chat-skeleton span,
  .spark-chat-markdown-streaming :deep(p:last-child)::after,
  .spark-chat-markdown-streaming :deep(li:last-child)::after {
    animation: none;
  }
}

@keyframes spark-chat-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes spark-chat-pulse {
  0%, 100% {
    opacity: 0.35;
    transform: scale(0.72);
  }
  50% {
    opacity: 0.9;
    transform: scale(1);
  }
}

@keyframes spark-chat-scan {
  0% {
    transform: translateX(-100%);
  }
  55%, 100% {
    transform: translateX(100%);
  }
}

@keyframes spark-chat-live {
  70% {
    box-shadow: 0 0 0 0.35rem rgb(16 185 129 / 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgb(16 185 129 / 0);
  }
}

@keyframes spark-chat-skeleton {
  0% {
    background-position: 120% 0;
  }
  100% {
    background-position: -120% 0;
  }
}

@keyframes spark-chat-cursor {
  50% {
    opacity: 0;
  }
}
</style>
