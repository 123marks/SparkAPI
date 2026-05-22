<template>
  <div class="mb-4 flex flex-col gap-3 rounded-lg border border-primary-100 bg-primary-50 p-3 dark:border-primary-800/40 dark:bg-primary-900/20 lg:flex-row lg:items-center lg:justify-between">
    <div class="min-w-0">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-sm font-medium text-primary-900 dark:text-primary-100">
          {{
            selectedIds.length > 0
              ? t('admin.accounts.bulkActions.selected', { count: selectedIds.length })
              : t('admin.accounts.bulkActions.filteredReady')
          }}
        </span>
        <template v-if="selectedIds.length > 0">
          <span class="text-gray-300 dark:text-primary-800">/</span>
          <button
            type="button"
            class="text-xs font-medium text-primary-700 hover:text-primary-800 dark:text-primary-300 dark:hover:text-primary-200"
            @click="$emit('select-page')"
          >
            {{ t('admin.accounts.bulkActions.selectCurrentPage') }}
          </button>
          <span class="text-gray-300 dark:text-primary-800">/</span>
          <button
            type="button"
            class="text-xs font-medium text-primary-700 hover:text-primary-800 dark:text-primary-300 dark:hover:text-primary-200"
            @click="$emit('clear')"
          >
            {{ t('admin.accounts.bulkActions.clear') }}
          </button>
        </template>
      </div>
      <p class="mt-1 text-xs text-primary-700/80 dark:text-primary-200/80">
        {{
          selectedIds.length > 0
            ? t('admin.accounts.bulkActions.selectedHint')
            : t('admin.accounts.bulkActions.filteredHint')
        }}
      </p>
    </div>
    <div class="flex flex-wrap gap-2">
      <template v-if="selectedIds.length > 0">
        <button type="button" @click="$emit('delete')" class="btn btn-danger btn-sm">{{ t('admin.accounts.bulkActions.delete') }}</button>
        <button type="button" @click="$emit('reset-status')" class="btn btn-secondary btn-sm">{{ t('admin.accounts.bulkActions.resetStatus') }}</button>
        <button type="button" @click="$emit('refresh-token')" class="btn btn-secondary btn-sm">{{ t('admin.accounts.bulkActions.refreshToken') }}</button>
        <button type="button" @click="$emit('toggle-schedulable', true)" class="btn btn-success btn-sm">{{ t('admin.accounts.bulkActions.enableScheduling') }}</button>
        <button type="button" @click="$emit('toggle-schedulable', false)" class="btn btn-warning btn-sm">{{ t('admin.accounts.bulkActions.disableScheduling') }}</button>
        <button type="button" @click="$emit('edit-selected')" class="btn btn-primary btn-sm">{{ t('admin.accounts.bulkActions.edit') }}</button>
      </template>
      <button type="button" @click="$emit('edit-filtered')" class="btn btn-primary btn-sm">
        {{ t('admin.accounts.bulkActions.editFiltered') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{
  selectedIds: number[]
}>()

defineEmits<{
  (e: 'delete'): void
  (e: 'edit-selected'): void
  (e: 'edit-filtered'): void
  (e: 'clear'): void
  (e: 'select-page'): void
  (e: 'toggle-schedulable', value: boolean): void
  (e: 'reset-status'): void
  (e: 'refresh-token'): void
}>()

const { t } = useI18n()
</script>
