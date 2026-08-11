import { describe, expect, it } from 'vitest'
import {
  calculateDownloadPercent,
  describeUpdaterError,
  isRetryableUpdaterError,
  parseReleaseNotes,
  runUpdateCheckWithRetry,
} from './updater-utils'

describe('parseReleaseNotes', () => {
  it('extracts the release summary and named sections without Markdown syntax', () => {
    const notes = parseReleaseNotes(`# LightClip v2.2.2

This release improves positioning.

## Fixed

- Restores the **focused control**.
- Keeps the panel beside the caret.

## Verification

- Packaged smoke test passed.`)

    expect(notes).toEqual({
      summary: ['This release improves positioning.'],
      sections: [
        { title: 'Fixed', items: ['Restores the focused control.', 'Keeps the panel beside the caret.'] },
        { title: 'Verification', items: ['Packaged smoke test passed.'] },
      ],
    })
  })

  it('returns an empty structure for missing notes', () => {
    expect(parseReleaseNotes()).toEqual({ summary: [], sections: [] })
  })
})

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
    expect(describeUpdaterError(new Error('network unavailable'))).toBe('连接更新服务超时。请稍后重试，或直接使用浏览器下载安装包。')
    expect(describeUpdaterError(null)).toBe('更新服务暂时不可用，请稍后重试')
  })
})

describe('runUpdateCheckWithRetry', () => {
  it('retries transient failures with the configured longer timeout', async () => {
    const attempts: number[] = []
    const result = await runUpdateCheckWithRetry(
      async (timeoutMs) => {
        attempts.push(timeoutMs)
        if (attempts.length === 1) {
          throw new Error('request timed out')
        }
        return 'v2.2.3'
      },
      { timeouts: [6_000, 20_000], retryDelayMs: 0 },
    )

    expect(result).toBe('v2.2.3')
    expect(attempts).toEqual([6_000, 20_000])
  })

  it('does not retry signature or metadata failures', async () => {
    let attempts = 0
    await expect(
      runUpdateCheckWithRetry(
        async () => {
          attempts += 1
          throw new Error('signature verification failed')
        },
        { timeouts: [6_000, 20_000], retryDelayMs: 0 },
      ),
    ).rejects.toThrow('signature verification failed')
    expect(attempts).toBe(1)
    expect(isRetryableUpdaterError('signature verification failed')).toBe(false)
  })
})
