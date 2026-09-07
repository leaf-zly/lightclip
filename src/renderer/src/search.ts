import type { ClipboardItem } from '../../shared/types'

/** Time windows available in the history toolbar. */
export type HistoryTimeFilter = 'all' | 'today' | 'week' | 'month'

/**
 * Matches content and structured qualifiers against one clipboard item.
 * Supported qualifiers are `type:text|image|file`, `from:today|week|month`, and `is:pinned`.
 *
 * @param item Clipboard record to inspect.
 * @param query User-entered content and qualifier expression.
 * @param now Reference timestamp used by relative date qualifiers.
 * @returns Whether every query term matches the item.
 */
export function matchesAdvancedQuery(item: ClipboardItem, query: string, now = Date.now()): boolean {
  const terms = Array.from(query.matchAll(/"([^"]+)"|(\S+)/g), (match) => (match[1] || match[2]).toLocaleLowerCase())
  if (!terms.length) {
    return true
  }

  const searchable = getSearchableText(item).toLocaleLowerCase()
  return terms.every((term) => {
    const typeMatch = term.match(/^type:(text|image|file)$/)
    if (typeMatch) {
      return item.kind === typeMatch[1]
    }

    const fromMatch = term.match(/^from:(today|week|month)$/)
    if (fromMatch) {
      return matchesTimeFilter(item, fromMatch[1] as HistoryTimeFilter, now)
    }

    if (term === 'is:pinned') {
      return item.pinned
    }

    return searchable.includes(term)
  })
}

/** Returns whether an item falls inside the selected relative time window. */
export function matchesTimeFilter(item: ClipboardItem, filter: HistoryTimeFilter, now = Date.now()): boolean {
  if (filter === 'all') {
    return true
  }
  if (filter === 'today') {
    const midnight = new Date(now)
    midnight.setHours(0, 0, 0, 0)
    return item.updatedAt >= midnight.getTime()
  }
  const windowDays = filter === 'week' ? 7 : 30
  return item.updatedAt >= now - windowDays * 24 * 60 * 60 * 1000
}

function getSearchableText(item: ClipboardItem): string {
  if (item.kind === 'text') {
    return `文本 text ${item.text}`
  }
  if (item.kind === 'file') {
    return `文件 file ${item.paths.join(' ')}`
  }
  return `图片 image ${item.width}x${item.height}`
}