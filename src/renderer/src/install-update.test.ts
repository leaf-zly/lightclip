import { describe, expect, it, vi } from 'vitest'
import type { Update } from '@tauri-apps/plugin-updater'
import { installSignedUpdate, type InstallEvent } from './install-update'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({
  invoke,
  Channel: class { onmessage?: (event: InstallEvent) => void },
}))

describe('checked installer handoff', () => {
  it('passes only the updater resource and preserves verified-install progress', async () => {
    const events: InstallEvent[] = []
    invoke.mockImplementationOnce(async (command, args) => {
      expect(command).toBe('install_signed_update')
      expect(Object.keys(args).sort()).toEqual(['onEvent', 'rid'])
      expect(args.rid).toBe(42)
      args.onEvent.onmessage({ event: 'Finished' })
      args.onEvent.onmessage({ event: 'Installing' })
    })
    await installSignedUpdate({ rid: 42 } as Update, event => events.push(event))
    expect(events).toEqual([{ event: 'Finished' }, { event: 'Installing' }])
  })

  it('propagates failed launch without calling a restart or exit command', async () => {
    invoke.mockClear()
    invoke.mockRejectedValueOnce(new Error('Installer could not start'))
    await expect(installSignedUpdate({ rid: 42 } as Update, () => {})).rejects.toThrow('Installer could not start')
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(invoke.mock.calls[0][0]).toBe('install_signed_update')
  })
})
