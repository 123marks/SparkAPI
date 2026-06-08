<template>
  <AppLayout>
    <div class="flex h-[calc(100vh-5rem)] min-h-[680px] flex-col">
      <SparkChatConsole
        layout="split"
        storage-key="sparkapi_admin_chat_workbench"
        :title="t('admin.chatWorkbench.title')"
        :description="t('admin.chatWorkbench.description')"
        :default-context="defaultContext"
        show-mode-controls
      />
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import AppLayout from '@/components/layout/AppLayout.vue'
import SparkChatConsole from '@/components/chat/SparkChatConsole.vue'

const { t } = useI18n()

const defaultContext = [
  'SparkAPI is a self-hosted AI API gateway based on sub2api.',
  'Focus on account pools, routing, proxy strategy, safe admin operations, and practical fixes.',
  'When files are attached, treat them as user-provided snippets and reason from the visible content only.'
].join('\n')
</script>
