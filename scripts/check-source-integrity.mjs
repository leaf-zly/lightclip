import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TextDecoder } from 'node:util'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const utf8Decoder = new TextDecoder('utf-8', { fatal: true })

/**
 * Critical source files that must remain plain UTF-8 text before TypeScript
 * compilation. The required tokens make accidental binary or stale generated
 * content fail with a focused diagnostic instead of noisy TypeScript parser
 * errors.
 */
const criticalSources = [
  {
    path: 'src/shared/types.ts',
    asciiOnly: true,
    requiredTokens: ['export type ClipboardItemKind', 'height: number', 'export interface AppSettings', 'export const IPC_CHANNELS'],
  },
  {
    path: 'src/renderer/src/utils.ts',
    requiredTokens: ['export function formatRelativeTime', 'export function describeItem', 'export function matchesQuery'],
  },
  {
    path: 'src/main/store.ts',
    requiredTokens: ['lightclip-store.json.br', 'brotliCompress', 'moveStorageDirectory'],
  },
  {
    path: 'src/main/index.ts',
    requiredTokens: ['selectStorageDirectory', 'resetStorageDirectory', 'openStorageDirectory'],
  },
]

/**
 * Reads a source file as strict UTF-8 text and rejects common signs of binary
 * corruption before the compiler sees the file.
 *
 * @param {string} relativePath Source path relative to the project root.
 * @returns {Promise<string>} Decoded UTF-8 source text.
 */
async function readVerifiedText(relativePath) {
  const absolutePath = resolve(rootDir, relativePath)
  const bytes = await readFile(absolutePath)

  if (bytes.includes(0)) {
    throw new Error(`${relativePath} contains NUL bytes and is not valid TypeScript text.`)
  }

  let text
  try {
    text = utf8Decoder.decode(bytes)
  } catch (error) {
    throw new Error(`${relativePath} is not valid UTF-8: ${error.message}`)
  }

  if (text.includes('\uFFFD')) {
    throw new Error(`${relativePath} contains replacement characters, which usually means the file was decoded from binary data.`)
  }

  return text
}

/**
 * Reports the first non-ASCII character in a file that is expected to stay
 * ASCII-only for portability and easier corruption detection.
 *
 * @param {string} text Decoded source text.
 * @returns {number} Zero-based character offset, or -1 when all characters are ASCII.
 */
function findFirstNonAsciiOffset(text) {
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) > 0x7f) {
      return index
    }
  }

  return -1
}

/**
 * Ensures every critical file still looks like the expected source file.
 */
async function main() {
  const failures = []

  for (const source of criticalSources) {
    try {
      const text = await readVerifiedText(source.path)
      if (source.asciiOnly) {
        const nonAsciiOffset = findFirstNonAsciiOffset(text)
        if (nonAsciiOffset !== -1) {
          failures.push(`${source.path} contains non-ASCII content at character ${nonAsciiOffset}.`)
        }
      }
      for (const token of source.requiredTokens) {
        if (!text.includes(token)) {
          failures.push(`${source.path} is missing expected token: ${token}`)
        }
      }
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error))
    }
  }

  if (failures.length > 0) {
    console.error('Source integrity check failed:')
    for (const failure of failures) {
      console.error(`- ${failure}`)
    }
    console.error('\nRestore the affected file from Git before running build or dist again.')
    process.exitCode = 1
    return
  }

  console.log('Source integrity check passed.')
}

await main()
