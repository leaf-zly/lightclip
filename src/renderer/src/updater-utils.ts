/**
 * Converts an unknown updater failure into a concise user-facing message.
 *
 * @param error Failure thrown by the Tauri updater API.
 * @returns A stable message suitable for the update dialog.
 */
export function describeUpdaterError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim()
  }
  return typeof error === 'string' && error.trim() ? error.trim() : '更新服务暂时不可用，请稍后重试'
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
