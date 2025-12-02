/**
 * @fileoverview Platform detection utilities
 */

export type Platform = 'mac' | 'win' | 'linux' | 'chromeos' | 'unknown'

/**
 * Gets the current platform
 */
export async function getPlatform(): Promise<Platform> {
  try {
    const platformInfo = await chrome.runtime.getPlatformInfo()
    return platformInfo.os as Platform
  } catch (error) {
    console.warn('Failed to get platform info:', error)
    return 'unknown'
  }
}

/**
 * Checks if running on macOS
 */
export async function isMac(): Promise<boolean> {
  const platform = await getPlatform()
  return platform === 'mac'
}

/**
 * Checks if running on Windows
 */
export async function isWindows(): Promise<boolean> {
  const platform = await getPlatform()
  return platform === 'win'
}

/**
 * Assert helper
 */
export function assert(condition: unknown, message?: string): asserts condition {
  if (!condition) {
    throw new Error(message ?? 'Assertion failed')
  }
}
