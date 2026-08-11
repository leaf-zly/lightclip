/** A structured release-note section rendered by the updater dialog. */
export interface ReleaseNoteSection {
  /** Section heading without Markdown markers. */
  title: string
  /** Plain-text paragraphs or list entries in display order. */
  items: string[]
}

/** Parsed release notes suitable for safe Vue template rendering. */
export interface ParsedReleaseNotes {
  /** Introductory paragraphs that appear before the first section. */
  summary: string[]
  /** Named sections extracted from level-two Markdown headings. */
  sections: ReleaseNoteSection[]
}

/**
 * Converts the small Markdown subset used by GitHub release notes into safe,
 * structured text without injecting HTML into the updater WebView.
 *
 * @param body Raw release body returned by the Tauri updater.
 * @returns Introductory paragraphs and section entries in source order.
 */
export function parseReleaseNotes(body?: string | null): ParsedReleaseNotes {
  const summary: string[] = []
  const sections: ReleaseNoteSection[] = []
  let currentSection: ReleaseNoteSection | null = null

  for (const rawLine of (body ?? '').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || /^#\s+/.test(line)) {
      continue
    }
    const heading = line.match(/^##\s+(.+)$/)
    if (heading) {
      currentSection = { title: heading[1].trim(), items: [] }
      sections.push(currentSection)
      continue
    }
    const text = line.replace(/^[-*]\s+/, '').replace(/\*\*(.+?)\*\*/g, '$1').trim()
    if (!text) {
      continue
    }
    if (currentSection) {
      currentSection.items.push(text)
    } else {
      summary.push(text)
    }
  }

  return {
    summary,
    sections: sections.filter((section) => section.items.length > 0),
  }
}

/**
 * Converts an unknown updater failure into a concise user-facing message.
 *
 * @param error Failure thrown by the Tauri updater API.
 * @returns A stable message suitable for the update dialog.
 */
export function describeUpdaterError(error: unknown): string {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  const message = raw.trim()
  if (!message) {
    return '更新服务暂时不可用，请稍后重试'
  }
  if (/timed out|timeout|network|fetch|connection|url|endpoint|github/i.test(message)) {
    return '暂时无法连接更新服务，请检查网络后重试，或使用浏览器下载。'
  }
  return message.replace(/https?:\/\/\S+/gi, '更新服务器')
}

/**
 * Calculates a bounded integer download percentage.
 *
 * @param downloadedBytes Bytes received so far.
 * @param totalBytes Optional response content length.
 * @returns Percentage in the 0-100 range, or null when total size is unknown.
 */
export function calculateDownloadPercent(downloadedBytes: number, totalBytes?: number): number | null {
  if (!totalBytes || totalBytes <= 0) {
    return null
  }
  return Math.min(100, Math.max(0, Math.round((downloadedBytes / totalBytes) * 100)))
}
