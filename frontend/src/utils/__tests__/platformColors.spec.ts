import { describe, expect, it } from 'vitest'
import { platformBadgeClass, platformButtonClass, platformLabel } from '../platformColors'

describe('platformColors', () => {
  it('exposes Grok as a first-class provider with cyan styling', () => {
    expect(platformLabel('grok')).toBe('Grok')
    expect(platformBadgeClass('grok')).toContain('cyan')
    expect(platformButtonClass('grok')).toContain('cyan')
  })
})
