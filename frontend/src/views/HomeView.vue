<template>
  <!-- Custom Home Content: Full Page Mode -->
  <div v-if="homeContent" class="min-h-screen">
    <!-- iframe mode -->
    <iframe
      v-if="isHomeContentUrl"
      :src="homeContent.trim()"
      class="h-screen w-full border-0"
      allowfullscreen
    ></iframe>
    <!-- HTML mode: admin configured content is sanitized before rendering. -->
    <div v-else v-html="sanitizedHomeContent"></div>
  </div>

  <!-- Default Home Page -->
  <div v-else class="flex min-h-screen flex-col bg-gray-50 text-gray-900 dark:bg-dark-950 dark:text-white">
    <header class="border-b border-gray-200 bg-white/95 px-4 py-3 dark:border-dark-800 dark:bg-dark-900/95 sm:px-6 lg:px-8">
      <nav class="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <div class="flex min-w-0 items-center gap-3">
          <div class="h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-dark-700 dark:bg-dark-800">
            <img :src="siteLogo || '/logo.png'" alt="Logo" class="h-full w-full object-contain" />
          </div>
          <div class="min-w-0">
            <div class="truncate text-sm font-semibold text-gray-950 dark:text-white">{{ siteName }}</div>
            <div class="truncate text-xs text-gray-500 dark:text-dark-400">{{ siteSubtitle }}</div>
          </div>
        </div>

        <div class="flex flex-shrink-0 items-center gap-2">
          <LocaleSwitcher />
          <a
            v-if="docUrl"
            :href="docUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-dark-400 dark:hover:bg-dark-800 dark:hover:text-white"
            :title="t('home.viewDocs')"
          >
            <Icon name="book" size="md" />
          </a>
          <button
            class="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-dark-400 dark:hover:bg-dark-800 dark:hover:text-white"
            :title="isDark ? t('home.switchToLight') : t('home.switchToDark')"
            @click="toggleTheme"
          >
            <Icon v-if="isDark" name="sun" size="md" />
            <Icon v-else name="moon" size="md" />
          </button>
          <router-link
            :to="isAuthenticated ? dashboardPath : '/login'"
            class="btn btn-primary btn-sm"
          >
            {{ isAuthenticated ? t('home.dashboard') : t('home.login') }}
          </router-link>
        </div>
      </nav>
    </header>

    <main class="flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <div class="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section class="min-w-0">
          <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div class="min-w-0">
              <h1 class="text-2xl font-semibold tracking-normal text-gray-950 dark:text-white md:text-3xl">
                {{ siteName }}
              </h1>
              <p class="mt-1 max-w-3xl text-sm text-gray-600 dark:text-dark-300 md:text-base">
                {{ t('home.chatConsole.description') }}
              </p>
            </div>
            <router-link
              :to="isAuthenticated ? dashboardPath : '/login'"
              class="btn btn-secondary flex-shrink-0"
            >
              {{ isAuthenticated ? t('home.goToDashboard') : t('home.getStarted') }}
              <Icon name="arrowRight" size="sm" class="ml-2" :stroke-width="2" />
            </router-link>
          </div>

          <SparkChatConsole
            layout="compact"
            storage-key="sparkapi_home_chat"
            :title="t('home.chatConsole.title')"
            :description="siteSubtitle"
            :default-context="homeChatContext"
            :show-mode-controls="false"
            default-mode="ops"
          />
        </section>

        <aside class="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <section class="rounded-lg border border-gray-200 bg-white p-4 dark:border-dark-700 dark:bg-dark-900">
            <h2 class="text-sm font-semibold text-gray-950 dark:text-white">
              {{ t('home.providers.title') }}
            </h2>
            <p class="mt-1 text-xs leading-5 text-gray-500 dark:text-dark-400">
              {{ t('home.providers.description') }}
            </p>
            <div class="mt-4 space-y-2">
              <div
                v-for="provider in providers"
                :key="provider.name"
                class="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-dark-700"
              >
                <div class="flex min-w-0 items-center gap-2">
                  <span class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded bg-gray-100 text-xs font-semibold text-gray-700 dark:bg-dark-800 dark:text-dark-200">
                    {{ provider.initial }}
                  </span>
                  <span class="truncate font-medium text-gray-800 dark:text-dark-100">{{ provider.name }}</span>
                </div>
                <span
                  class="rounded bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700 dark:bg-primary-900/20 dark:text-primary-200"
                >
                  {{ t('home.providers.supported') }}
                </span>
              </div>
            </div>
          </section>

          <section class="rounded-lg border border-gray-200 bg-white p-4 dark:border-dark-700 dark:bg-dark-900">
            <h2 class="text-sm font-semibold text-gray-950 dark:text-white">
              {{ t('home.features.unifiedGateway') }}
            </h2>
            <div class="mt-4 space-y-3">
              <div
                v-for="feature in featureHighlights"
                :key="feature.title"
                class="flex gap-3"
              >
                <Icon :name="feature.icon" size="sm" class="mt-0.5 flex-shrink-0 text-primary-500" />
                <div class="min-w-0">
                  <div class="text-sm font-medium text-gray-900 dark:text-white">{{ feature.title }}</div>
                  <div class="mt-1 text-xs leading-5 text-gray-500 dark:text-dark-400">{{ feature.description }}</div>
                </div>
              </div>
            </div>
          </section>

          <section class="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-800 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-200">
            {{ t('chatConsole.safetyNote') }}
          </section>
        </aside>
      </div>
    </main>

    <footer class="border-t border-gray-200 px-4 py-5 dark:border-dark-800 sm:px-6 lg:px-8">
      <div class="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 text-center sm:flex-row sm:text-left">
        <p class="text-sm text-gray-500 dark:text-dark-400">
          &copy; {{ currentYear }} {{ siteName }}. {{ t('home.footer.allRightsReserved') }}
        </p>
        <div class="flex items-center gap-4">
          <a
            v-if="docUrl"
            :href="docUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-dark-400 dark:hover:text-white"
          >
            {{ t('home.docs') }}
          </a>
          <a
            :href="githubUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-dark-400 dark:hover:text-white"
          >
            GitHub
          </a>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import DOMPurify from 'dompurify'
import { useAuthStore, useAppStore } from '@/stores'
import LocaleSwitcher from '@/components/common/LocaleSwitcher.vue'
import Icon from '@/components/icons/Icon.vue'
import SparkChatConsole from '@/components/chat/SparkChatConsole.vue'

const { t } = useI18n()

const authStore = useAuthStore()
const appStore = useAppStore()

// Site settings - directly from appStore (already initialized from injected config)
const siteName = computed(() => appStore.cachedPublicSettings?.site_name || appStore.siteName || 'SparkAPI')
const siteLogo = computed(() => appStore.cachedPublicSettings?.site_logo || appStore.siteLogo || '')
const siteSubtitle = computed(() => appStore.cachedPublicSettings?.site_subtitle || 'AI API Gateway Platform')
const docUrl = computed(() => appStore.cachedPublicSettings?.doc_url || appStore.docUrl || '')
const homeContent = computed(() => appStore.cachedPublicSettings?.home_content || '')
const sanitizedHomeContent = computed(() => DOMPurify.sanitize(homeContent.value))
const homeChatContext = computed(() => [
  `${siteName.value} is a SparkAPI gateway instance.`,
  'The user is chatting from the public home page through their own gateway API key.',
  'Help with API usage, file analysis, prompt drafting, and gateway troubleshooting. Keep advice practical and avoid exposing secrets.'
].join('\n'))
const providers = computed(() => [
  { name: t('home.providers.claude'), initial: 'C' },
  { name: 'GPT', initial: 'G' },
  { name: t('home.providers.gemini'), initial: 'G' },
  { name: t('home.providers.antigravity'), initial: 'A' }
])
const featureHighlights = computed(() => [
  {
    icon: 'server' as const,
    title: t('home.tags.subscriptionToApi'),
    description: t('home.features.unifiedGatewayDesc')
  },
  {
    icon: 'shield' as const,
    title: t('home.tags.stickySession'),
    description: t('home.features.multiAccountDesc')
  },
  {
    icon: 'chart' as const,
    title: t('home.tags.realtimeBilling'),
    description: t('home.features.balanceQuotaDesc')
  }
])

// Check if homeContent is a URL (for iframe display)
const isHomeContentUrl = computed(() => {
  const content = homeContent.value.trim()
  return content.startsWith('http://') || content.startsWith('https://')
})

// Theme
const isDark = ref(document.documentElement.classList.contains('dark'))

// GitHub URL
const githubUrl = 'https://github.com/Wei-Shaw/sub2api'

// Auth state
const isAuthenticated = computed(() => authStore.isAuthenticated)
const isAdmin = computed(() => authStore.isAdmin)
const dashboardPath = computed(() => isAdmin.value ? '/admin/dashboard' : '/dashboard')

// Current year for footer
const currentYear = computed(() => new Date().getFullYear())

// Toggle theme
function toggleTheme() {
  isDark.value = !isDark.value
  document.documentElement.classList.toggle('dark', isDark.value)
  localStorage.setItem('theme', isDark.value ? 'dark' : 'light')
}

// Initialize theme
function initTheme() {
  const savedTheme = localStorage.getItem('theme')
  if (
    savedTheme === 'dark' ||
    (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)
  ) {
    isDark.value = true
    document.documentElement.classList.add('dark')
  }
}

onMounted(() => {
  initTheme()

  // Check auth state
  authStore.checkAuth()

  // Ensure public settings are loaded (will use cache if already loaded from injected config)
  if (!appStore.publicSettingsLoaded) {
    appStore.fetchPublicSettings()
  }
})
</script>
