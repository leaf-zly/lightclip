import { describe, expect, it } from 'vitest'
import { calculateDownloadPercent, describeUpdaterError } from './updater-utils'

describe('calculateDownloadPercent', () => {
  it('returns null without a valid content length', () => {
    expect(calculateDownloadPercent(20)).toBeNull()
    expect(calculateDownloadPercent(20, 0)).toBeNull()
  })

  it('bounds progress to an integer percentage', () => {
    expect(calculateDownloadPercent(25, 100)).toBe(25)
    expect(calculateDownloadPercent(120, 100)).toBe(100)
    expect(calculateDownloadPercent(-5, 100)).toBe(0)
  })
})

describe('describeUpdaterError', () => {
  it('uses error messages and provides a stable fallback', () => {
    expect(describeUpdaterError(new Error('network unavailable'))).toBe('network unavailable')
    expect(describeUpdaterError(null)).toBe('更新服务暂时不可用，请稍后重试')
  })
})
