import type { ClipboardItem, HistoryItemUpsert } from '../../shared/types'

/** Merges a record and prunes IDs removed by native retention or size limits. */
export function mergeHistoryUpdate(items: readonly ClipboardItem[], update: HistoryItemUpsert): ClipboardItem[] {
  const retained = update.retainedIds ? new Set(update.retainedIds) : null
  const next = items.filter((item) => item.id !== update.item.id && (!retained || retained.has(item.id)))
  if (!retained || retained.has(update.item.id)) next.push(update.item)
  return next.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt)
}
