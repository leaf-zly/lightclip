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
