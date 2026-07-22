import type { CommandResult } from './types.js'

/** Result returned after deduplicating and trimming local history storage. */
export interface StorageMaintenanceResult {
  /** Number of duplicate or over-budget records removed. */
  removedItems: number
  /** Compressed store size before maintenance. */
  beforeBytes: number
  /** Compressed store size after maintenance. */
  afterBytes: number
}

declare module './types.js' {
  interface AppSettings {
    /** Excludes likely credentials, verification codes, and payment-card numbers from history. */
    sensitiveContentProtection: boolean
    /** Additional case-insensitive keywords that mark clipboard text as sensitive. */
    sensitiveKeywords: string[]
    /** Approximate maximum history payload in bytes; zero disables the size limit. */
    maxStorageBytes: number
    /** Whether timestamped rolling store backups are created automatically. */
    automaticBackups: boolean
    /** Minimum hours between rolling backups. */
    backupIntervalHours: number
    /** Maximum number of rolling backups retained. */
    backupKeepCount: number
  }

  interface LightClipApi {
    /** Deduplicates local history and applies configured retention and size limits. */
    optimizeStorage?: () => Promise<CommandResult<StorageMaintenanceResult>>
  }
}
