import { describe, expect, it } from 'vitest'
import type { TextClipboardItem } from '../../shared/types'
import { mergeHistoryUpdate } from './history'
import { formatBytes } from './utils'
import { matchesTimeFilter } from './search'

const item = (id: string, updatedAt = 1, pinned = false): TextClipboardItem => ({ id, kind: 'text', text: id, createdAt: 1, updatedAt, pinned, copyCount: 0 })

describe('incremental history reconciliation', () => {
  it('removes evicted records and preserves pinned ordering without mutating the old list', () => {
    const previous = [item('old'), item('pin', 1, true)]
    const result = mergeHistoryUpdate(previous, { item: item('new', 2), retainedIds: ['pin', 'new'], storageBytes: 12 })
    expect(result.map(({ id }) => id)).toEqual(['pin', 'new'])
    expect(previous.map(({ id }) => id)).toEqual(['old', 'pin'])
  })
  it('does not reinsert a record immediately removed by the storage budget', () => {
    expect(mergeHistoryUpdate([item('old')], { item: item('oversize'), retainedIds: [], storageBytes: 0 })).toEqual([])
  })
  it('supports older runtimes that omit retention IDs', () => {
    const result = mergeHistoryUpdate([item('one'), item('two')], { item: item('one', 3), storageBytes: 0 })
    expect(result.map(({ id }) => id)).toEqual(['one', 'two'])
    expect(result[0].updatedAt).toBe(3)
  })
})

it('does not display NaN, infinity, or negative storage sizes', () => {
  for (const value of [NaN, Infinity, -1]) expect(formatBytes(value)).toBe('0 B')
  expect(formatBytes(1024)).toBe('1.0 KB')
})

it('today means the local calendar day rather than the previous 24 hours', () => {
  const now = new Date(2026, 8, 7, 12).getTime()
  expect(matchesTimeFilter(item('yesterday', new Date(2026, 8, 6, 23).getTime()), 'today', now)).toBe(false)
  expect(matchesTimeFilter(item('midnight', new Date(2026, 8, 7).getTime()), 'today', now)).toBe(true)
})
