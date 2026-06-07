<template>
  <BaseDialog
    :show="show"
    :title="t('admin.proxies.dataImportTitle')"
    width="normal"
    close-on-click-outside
    @close="handleClose"
  >
    <form id="import-proxy-data-form" class="space-y-4" @submit.prevent="handleImport">
      <div class="text-sm text-gray-600 dark:text-dark-300">
        {{ t('admin.proxies.dataImportHint') }}
      </div>
      <div
        class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-600 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400"
      >
        {{ t('admin.proxies.dataImportWarning') }}
      </div>

      <div>
        <label class="input-label">{{ t('admin.proxies.dataImportFile') }}</label>
        <div
          class="flex items-center justify-between gap-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-3 dark:border-dark-600 dark:bg-dark-800"
        >
          <div class="min-w-0">
            <div class="truncate text-sm text-gray-700 dark:text-dark-200" :title="fileSummary">
              {{ fileSummary || t('admin.proxies.dataImportSelectFile') }}
            </div>
            <div class="text-xs text-gray-500 dark:text-dark-400">
              {{ t('admin.proxies.dataImportFileHint') }}
            </div>
            <div v-if="files.length" class="text-xs text-gray-500 dark:text-dark-400">
              {{ t('admin.proxies.dataImportSelectedSize', { size: fileTotalSize }) }}
            </div>
          </div>
          <button type="button" class="btn btn-secondary shrink-0" @click="openFilePicker">
            {{ t('common.chooseFile') }}
          </button>
        </div>
        <p v-if="fileValidationMessage" class="mt-2 text-xs text-red-600 dark:text-red-400">
          {{ fileValidationMessage }}
        </p>
        <input
          ref="fileInput"
          type="file"
          class="hidden"
          accept="application/json,.json"
          multiple
          @change="handleFileChange"
        />
      </div>

      <div
        v-if="result"
        class="space-y-2 rounded-xl border border-gray-200 p-4 dark:border-dark-700"
      >
        <div class="text-sm font-medium text-gray-900 dark:text-white">
          {{ t('admin.proxies.dataImportResult') }}
        </div>
        <div class="text-sm text-gray-700 dark:text-dark-300">
          {{ t('admin.proxies.dataImportResultSummary', result) }}
        </div>

        <div v-if="errorItems.length" class="mt-2">
          <div class="text-sm font-medium text-red-600 dark:text-red-400">
            {{ t('admin.proxies.dataImportErrors') }}
          </div>
          <div
            class="mt-2 max-h-48 overflow-auto rounded-lg bg-gray-50 p-3 font-mono text-xs dark:bg-dark-800"
          >
            <div v-for="(item, idx) in errorItems" :key="idx" class="whitespace-pre-wrap">
              {{ item.kind }} {{ item.name || item.proxy_key || '-' }} — {{ item.message }}
            </div>
          </div>
        </div>
      </div>
    </form>

    <template #footer>
      <div class="flex justify-end gap-3">
        <button class="btn btn-secondary" type="button" :disabled="importing" @click="handleClose">
          {{ t('common.cancel') }}
        </button>
        <button
          class="btn btn-primary"
          type="submit"
          form="import-proxy-data-form"
          :disabled="importing || !!fileValidationMessage"
        >
          {{ importing ? t('admin.proxies.dataImporting') : t('admin.proxies.dataImportButton') }}
        </button>
      </div>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import BaseDialog from '@/components/common/BaseDialog.vue'
import { adminAPI } from '@/api/admin'
import { useAppStore } from '@/stores/app'
import {
  formatBytes,
  getAdminDataImportFileValidation,
  mergeAdminDataPayloads,
  parseAdminDataImportContent
} from '@/utils/dataImport'
import type { AdminDataImportResult, AdminDataPayload } from '@/types'

interface Props {
  show: boolean
}

interface Emits {
  (e: 'close'): void
  (e: 'imported'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const { t } = useI18n()
const appStore = useAppStore()

const importing = ref(false)
const files = ref<File[]>([])
const result = ref<AdminDataImportResult | null>(null)

const fileInput = ref<HTMLInputElement | null>(null)
const fileSummary = computed(() => {
  if (files.value.length === 0) return ''
  if (files.value.length === 1) return files.value[0].name
  return t('admin.proxies.dataImportSelectedFiles', {
    count: files.value.length,
    names: files.value.map((item) => item.name).join(', ')
  })
})
const fileValidation = computed(() => getAdminDataImportFileValidation(files.value))
const fileTotalSize = computed(() => formatBytes(fileValidation.value.totalBytes))
const fileValidationMessage = computed(() => {
  const validation = fileValidation.value
  if (validation.valid) return ''
  switch (validation.reason) {
    case 'file_too_large':
      return t('admin.proxies.dataImportFileTooLarge', {
        name: validation.fileName,
        max: formatBytes(validation.maxBytes)
      })
    case 'total_too_large':
      return t('admin.proxies.dataImportTotalTooLarge', {
        max: formatBytes(validation.maxBytes)
      })
    default:
      return ''
  }
})

const errorItems = computed(() => result.value?.errors || [])

watch(
  () => props.show,
  (open) => {
    if (open) {
      files.value = []
      result.value = null
      if (fileInput.value) {
        fileInput.value.value = ''
      }
    }
  }
)

const openFilePicker = () => {
  fileInput.value?.click()
}

const handleFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  files.value = Array.from(target.files || [])
  result.value = null
}

const handleClose = () => {
  if (importing.value) return
  emit('close')
}

const readFileAsText = async (sourceFile: File): Promise<string> => {
  if (typeof sourceFile.text === 'function') {
    return sourceFile.text()
  }

  if (typeof sourceFile.arrayBuffer === 'function') {
    const buffer = await sourceFile.arrayBuffer()
    return new TextDecoder().decode(buffer)
  }

  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'))
    reader.readAsText(sourceFile)
  })
}

const handleImport = async () => {
  if (files.value.length === 0) {
    appStore.showError(t('admin.proxies.dataImportSelectFile'))
    return
  }
  if (fileValidationMessage.value) {
    appStore.showError(fileValidationMessage.value)
    return
  }

  importing.value = true
  try {
    const payloads: AdminDataPayload[] = []
    for (const sourceFile of files.value) {
      const text = await readFileAsText(sourceFile)
      payloads.push(...parseAdminDataImportContent(text, sourceFile.name))
    }
    const dataPayload = mergeAdminDataPayloads(payloads)

    const res = await adminAPI.proxies.importData({ data: dataPayload })

    result.value = res

    const msgParams: Record<string, unknown> = {
      proxy_created: res.proxy_created,
      proxy_reused: res.proxy_reused,
      proxy_failed: res.proxy_failed
    }

    if (res.proxy_failed > 0) {
      appStore.showError(t('admin.proxies.dataImportCompletedWithErrors', msgParams))
    } else {
      appStore.showSuccess(t('admin.proxies.dataImportSuccess', msgParams))
      emit('imported')
    }
  } catch (error: any) {
    if (error instanceof SyntaxError) {
      appStore.showError(t('admin.proxies.dataImportParseFailed'))
    } else {
      appStore.showError(error?.message || t('admin.proxies.dataImportFailed'))
    }
  } finally {
    importing.value = false
  }
}
</script>
