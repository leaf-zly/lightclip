import type { ClipboardItem } from '../../shared/types'

/**
 * Formats timestamps into short labels suitable for a compact clipboard list.
 */
export function formatRelativeTime(timestamp: number, now = Date.now()): string {
  const diff = Math.max(0, now - timestamp)
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour

  if (diff < minute) {
    return '刚刚'
  }
  if (diff < hour) {
    return `${Math.floor(diff / minute)} 分钟前`
  }
  if (diff < day) {
    return `${Math.floor(diff / hour)} 小时前`
  }

  const date = new Date(timestamp)
  return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date
    .getMinutes()
    .toString()
    .padStart(2, '0')}`
}

/**
 * Produces a compact preview while preserving enough structure for code and prose snippets.
 */
export function createTextPreview(text: string, maxLength = 260): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized
}

/**
 * Returns a human-readable character and line count label for one history item.
 */
export function describeItem(item: ClipboardItem): string {
  if (item.kind === 'image') {
    return `${item.width} x ${item.height} / ${formatBytes(item.byteSize)}`
  }

  if (item.kind === 'file') {
    return `${item.paths.length} 个文件`
  }

  const lines = item.text.split(/\r\n|\r|\n/).length
  const charLabel = `${item.text.length} 字符`
  return lines > 1 ? `${charLabel} / ${lines} 行` : charLabel
}

/**
 * Returns the display title for any clipboard item kind.
 */
export function createItemTitle(item: ClipboardItem): string {
  if (item.kind === 'image') {
    return '图片剪贴板'
  }

  if (item.kind === 'file') {
    return item.paths.map((path) => path.split(/[\\/]/).pop() || path).join('、')
  }

  return createTextPreview(item.text)
}

/**
 * Scores whether a clipboard item matches the user's query.
 */
export function matchesQuery(item: ClipboardItem, query: string): boolean {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  if (!normalizedQuery) {
    return true
  }

  if (item.kind === 'image') {
    return ['图片', 'image', `${item.width}x${item.height}`].some((value) => value.toLocaleLowerCase().includes(normalizedQuery))
  }

  if (item.kind === 'file') {
    return item.paths.some((path) => path.toLocaleLowerCase().includes(normalizedQuery))
  }

  return item.text.toLocaleLowerCase().includes(normalizedQuery)
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
