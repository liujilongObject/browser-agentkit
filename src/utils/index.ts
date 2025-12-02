/**
 * @fileoverview Utility functions export
 */

export * from './timeout'
export * from './platform'
export * from './debugger'

/**
 * Helper to get modifiers bitmask
 */
export function getModifiersBitmask(modifiers: Set<string>): number {
  let mask = 0
  if (modifiers.has('Alt')) mask |= 1
  if (modifiers.has('Control')) mask |= 2
  if (modifiers.has('Meta')) mask |= 4
  if (modifiers.has('Shift')) mask |= 8
  return mask
}
