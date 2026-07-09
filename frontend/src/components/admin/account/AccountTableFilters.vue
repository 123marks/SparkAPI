<template>
  <div class="flex flex-wrap items-center gap-3">
    <SearchInput
      :model-value="searchQuery"
      :placeholder="t('admin.accounts.searchAccounts')"
      class="w-full sm:w-64"
      @update:model-value="$emit('update:searchQuery', $event)"
      @search="$emit('change')"
    />
    <Select :model-value="filters.platform" class="w-40" :options="pOpts" @update:model-value="updatePlatform" @change="$emit('change')" />
    <Select :model-value="filters.type" class="w-40" :options="tOpts" @update:model-value="updateType" @change="$emit('change')" />
    <Select :model-value="filters.status" class="w-40" :options="sOpts" @update:model-value="updateStatus" @change="$emit('change')" />
    <Select :model-value="filters.privacy_mode" class="w-40" :options="privacyOpts" @update:model-value="updatePrivacyMode" @change="$emit('change')" />
    <Select :model-value="filters.group" class="w-40" :options="gOpts" @update:model-value="updateGroup" @change="$emit('change')" />
    <Select :model-value="filters.created_range" class="w-44" :options="createdRangeOpts" @update:model-value="updateCreatedRange" />
    <div v-if="filters.created_range === 'custom'" class="flex items-center gap-2">
      <input
        :value="createdFromDate"
        type="date"
        class="filter-date-input"
        :aria-label="t('admin.accounts.createdFrom')"
        @change="updateCreatedDate('from', ($event.target as HTMLInputElement).value)"
      />
      <span class="text-xs text-gray-400 dark:text-dark-500">-</span>
      <input
        :value="createdToDate"
        type="date"
        class="filter-date-input"
        :aria-label="t('admin.accounts.createdTo')"
        @change="updateCreatedDate('to', ($event.target as HTMLInputElement).value)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Select from '@/components/common/Select.vue'
import SearchInput from '@/components/common/SearchInput.vue'
import type { AdminGroup } from '@/types'

type FilterValue = string | number | boolean | null
type AccountFilterState = Record<string, any> & {
  created_range?: string
  created_from?: string
  created_to?: string
}

const props = defineProps<{ searchQuery: string; filters: AccountFilterState; groups?: AdminGroup[] }>()
const emit = defineEmits(['update:searchQuery', 'update:filters', 'change'])
const { t } = useI18n()

const emitFilters = (updates: Partial<AccountFilterState>, shouldChange = false) => {
  emit('update:filters', { ...props.filters, ...updates })
  if (shouldChange) emit('change')
}

const updatePlatform = (value: FilterValue) => { emitFilters({ platform: value }) }
const updateType = (value: FilterValue) => { emitFilters({ type: value }) }
const updateStatus = (value: FilterValue) => { emitFilters({ status: value }) }
const updatePrivacyMode = (value: FilterValue) => { emitFilters({ privacy_mode: value }) }
const updateGroup = (value: FilterValue) => { emitFilters({ group: value }) }

const startOfLocalDay = (offsetDays = 0) => {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays)
}

const parseDateInput = (value: string, plusDays = 0) => {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return ''
  return new Date(year, month - 1, day + plusDays).toISOString()
}

const dateInputFromIso = (value?: string) => {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const createdFromDate = computed(() => dateInputFromIso(props.filters.created_from))
const createdToDate = computed(() => {
  if (!props.filters.created_to) return ''
  const endExclusive = new Date(props.filters.created_to)
  if (!Number.isFinite(endExclusive.getTime())) return ''
  endExclusive.setDate(endExclusive.getDate() - 1)
  return dateInputFromIso(endExclusive.toISOString())
})

const updateCreatedRange = (value: FilterValue) => {
  const range = typeof value === 'string' ? value : ''
  if (!range) {
    emitFilters({ created_range: '', created_from: '', created_to: '' }, true)
    return
  }
  if (range === 'custom') {
    emitFilters({ created_range: 'custom' }, true)
    return
  }

  const days = range === 'today' ? 0 : range === '7d' ? 6 : range === '30d' ? 29 : 0
  const from = startOfLocalDay(-days).toISOString()
  const to = startOfLocalDay(1).toISOString()
  emitFilters({ created_range: range, created_from: from, created_to: to }, true)
}

const updateCreatedDate = (side: 'from' | 'to', value: string) => {
  const updates: Partial<AccountFilterState> = { created_range: 'custom' }
  if (side === 'from') updates.created_from = value ? parseDateInput(value) : ''
  else updates.created_to = value ? parseDateInput(value, 1) : ''
  emitFilters(updates, true)
}

const pOpts = computed(() => [{ value: '', label: t('admin.accounts.allPlatforms') }, { value: 'anthropic', label: 'Anthropic' }, { value: 'openai', label: 'OpenAI' }, { value: 'grok', label: 'Grok' }, { value: 'gemini', label: 'Gemini' }, { value: 'antigravity', label: 'Antigravity' }, { value: 'kiro', label: 'Kiro' }])
const tOpts = computed(() => [{ value: '', label: t('admin.accounts.allTypes') }, { value: 'oauth', label: t('admin.accounts.oauthType') }, { value: 'setup-token', label: t('admin.accounts.setupToken') }, { value: 'apikey', label: t('admin.accounts.apiKey') }, { value: 'bedrock', label: 'AWS Bedrock' }])
const sOpts = computed(() => [{ value: '', label: t('admin.accounts.allStatus') }, { value: 'active', label: t('admin.accounts.status.active') }, { value: 'inactive', label: t('admin.accounts.status.inactive') }, { value: 'error', label: t('admin.accounts.status.error') }, { value: 'rate_limited', label: t('admin.accounts.status.rateLimited') }, { value: 'temp_unschedulable', label: t('admin.accounts.status.tempUnschedulable') }, { value: 'unschedulable', label: t('admin.accounts.status.unschedulable') }])
const privacyOpts = computed(() => [
  { value: '', label: t('admin.accounts.allPrivacyModes') },
  { value: '__unset__', label: t('admin.accounts.privacyUnset') },
  { value: 'training_off', label: 'Privacy' },
  { value: 'training_set_cf_blocked', label: 'CF' },
  { value: 'training_set_failed', label: 'Fail' }
])
const gOpts = computed(() => [
  { value: '', label: t('admin.accounts.allGroups') },
  { value: 'ungrouped', label: t('admin.accounts.ungroupedGroup') },
  ...(props.groups || []).map(g => ({ value: String(g.id), label: g.name }))
])
const createdRangeOpts = computed(() => [
  { value: '', label: t('admin.accounts.createdRangeAll') },
  { value: 'today', label: t('admin.accounts.createdRangeToday') },
  { value: '7d', label: t('admin.accounts.createdRange7d') },
  { value: '30d', label: t('admin.accounts.createdRange30d') },
  { value: 'custom', label: t('admin.accounts.createdRangeCustom') }
])
</script>

<style scoped>
.filter-date-input {
  @apply h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30 dark:border-dark-600 dark:bg-dark-800 dark:text-gray-100;
}
</style>
