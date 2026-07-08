import { baseCompile } from '@intlify/message-compiler'
import { describe, expect, it } from 'vitest'

import en from '../locales/en'
import zh from '../locales/zh'

function collectLeafMessages(value: unknown, prefix = ''): Array<{ path: string, message: string }> {
  if (typeof value === 'string') return [{ path: prefix, message: value }]
  if (!value || typeof value !== 'object') return []

  return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => (
    collectLeafMessages(item, prefix ? `${prefix}.${key}` : key)
  ))
}

function expectChatConsoleMessagesToCompile(localeName: string, messages: typeof en) {
  const leaves = collectLeafMessages(messages.chatConsole)
  expect(leaves.length).toBeGreaterThan(0)

  for (const leaf of leaves) {
    const errors: Error[] = []
    baseCompile(leaf.message, {
      mode: 'arrow',
      onError: (error) => {
        errors.push(error)
      }
    })
    expect(errors, `${localeName}.chatConsole.${leaf.path}: ${leaf.message}`).toHaveLength(0)
  }
}

describe('chat console locale messages', () => {
  it('compiles English messages used by the AI chat console', () => {
    expectChatConsoleMessagesToCompile('en', en)
  })

  it('compiles Chinese messages used by the AI chat console', () => {
    expectChatConsoleMessagesToCompile('zh', zh)
  })
})