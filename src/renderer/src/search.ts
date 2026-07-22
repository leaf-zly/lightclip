import type { ClipboardItem } from '../../shared/types'

/** Time windows available in the history toolbar. */
export type HistoryTimeFilter = 'all' | 'today' | 'week' | 'month'

/**
 * Matches all quoted or whitespace-separated terms against searchable item content.
 * Quoted terms preserve spaces, allowing exact multi-word snippet searches.
 */
export function matchesAdvancedQuery(item: ClipboardItem, query: string): boolean {
  const terms = Array.from(query.matchAll(/"([^"]+)"|(\S+)/g), (match) => (match[1] || match[2]).toLocaleLowerCase())
  if (!terms.length) {
    return true
  }

  const searchable = getSearchableText(item).toLocaleLowerCase()
  return terms.every((term) => searchable.includes(term))
}

/** Returns whether an item falls inside the selected relative time window. */
export function matchesTimeFilter(item: ClipboardItem, filter: HistoryTimeFilter, now = Date.now()): boolean {
  if (filter === 'all') {
    return true
  }
  const windowDays = filter === 'today' ? 1 : filter === 'week' ? 7 : 30
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
