import { describe, expect, it } from 'vitest'
import type { TextClipboardItem } from '../../shared/types'
import { matchesAdvancedQuery } from './search'

const textItem: TextClipboardItem = {
  id: 'search-test',
  kind: 'text',
  text: 'Build the release notes',
  pinned: true,
  copyCount: 2,
  createdAt: Date.now(),
  updatedAt: Date.now(),
}

describe('matchesAdvancedQuery', () => {
  it('supports content and structured qualifiers', () => {
    expect(matchesAdvancedQuery(textItem, 'release type:text')).toBe(true)
    expect(matchesAdvancedQuery(textItem, 'is:pinned from:today')).toBe(true)
    expect(matchesAdvancedQuery(textItem, 'type:image')).toBe(false)
  })
})