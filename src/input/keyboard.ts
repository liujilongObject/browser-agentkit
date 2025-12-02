/**
 * @fileoverview Keyboard input simulation
 */

import { assert, getPlatform, getModifiersBitmask } from '@/utils'
import { createKeyMap, USKeyboardLayout, modifierKeys, normalizeKeyForOS } from './keyboard-layout'
import { Debuggee, KeyDescription } from '@/types'

const keyMap = createKeyMap(USKeyboardLayout)

/**
 * RawKeyboard - Low-level keyboard implementation
 */
class RawKeyboard {
  constructor(private debuggee: Debuggee) {}

  /**
   * Sends a keydown event
   */
  async keydown(
    modifiers: Set<string>,
    description: KeyDescription,
    isAutoRepeat: boolean
  ): Promise<void> {
    const { code, key, location, text, keyCodeWithoutLocation } = description
    await chrome.debugger.sendCommand(this.debuggee, 'Input.dispatchKeyEvent', {
      type: text ? 'keyDown' : 'rawKeyDown',
      modifiers: getModifiersBitmask(modifiers),
      windowsVirtualKeyCode: keyCodeWithoutLocation,
      code,
      key,
      text,
      unmodifiedText: text,
      autoRepeat: isAutoRepeat,
      location,
      isKeypad: location === 3,
    })
  }

  /**
   * Sends a keyup event
   */
  async keyup(modifiers: Set<string>, description: KeyDescription): Promise<void> {
    const { code, key, location, keyCodeWithoutLocation } = description
    await chrome.debugger.sendCommand(this.debuggee, 'Input.dispatchKeyEvent', {
      type: 'keyUp',
      modifiers: getModifiersBitmask(modifiers),
      key,
      windowsVirtualKeyCode: keyCodeWithoutLocation,
      code,
      location,
    })
  }

  /**
   * Directly inserts text
   */
  async sendText(text: string): Promise<void> {
    await chrome.debugger.sendCommand(this.debuggee, 'Input.insertText', { text })
  }
}

/**
 * Keyboard - High-level keyboard simulation
 */
export class Keyboard {
  private _pressedModifiers = new Set<string>()
  private _pressedKeys = new Set<string>()
  private _os: string
  private _raw: RawKeyboard

  constructor(debuggee: Debuggee, os: string) {
    this._os = os
    this._raw = new RawKeyboard(debuggee)
  }

  /**
   * Presses a key down
   */
  async down(key: string): Promise<void> {
    const description = this._getKeyDescription(key)
    const isRepeat = this._pressedKeys.has(description.code)
    this._pressedKeys.add(description.code)

    if (modifierKeys.includes(description.key)) {
      this._pressedModifiers.add(description.key)
    }

    await this._raw.keydown(this._pressedModifiers, description, isRepeat)
  }

  /**
   * Releases a key
   */
  async up(key: string): Promise<void> {
    const description = this._getKeyDescription(key)

    if (modifierKeys.includes(description.key)) {
      this._pressedModifiers.delete(description.key)
    }

    this._pressedKeys.delete(description.code)
    await this._raw.keyup(this._pressedModifiers, description)
  }

  /**
   * Presses and releases a key
   */
  async press(key: string, options: { delay?: number } = {}): Promise<void> {
    const parts = key.split('+').map((p) => p.trim())
    const mainKey = parts.pop()

    for (const modifier of parts) {
      await this.down(modifier)
    }

    if (mainKey) {
      await this.down(mainKey)
    }

    if (options.delay) {
      await new Promise((resolve) => setTimeout(resolve, options.delay))
    }

    if (mainKey) {
      await this.up(mainKey)
    }

    for (const modifier of parts.reverse()) {
      await this.up(modifier)
    }
  }

  /**
   * Types a sequence of characters
   */
  async type(text: string, options: { delay?: number } = {}): Promise<void> {
    const { delay } = options

    for (const char of text) {
      if (keyMap.has(char)) {
        await this.press(char, { delay })
      } else {
        if (delay) {
          await new Promise((resolve) => setTimeout(resolve, delay))
        }
        await this.insertText(char)
      }
    }
  }

  /**
   * Inserts text directly
   */
  async insertText(text: string): Promise<void> {
    await this._raw.sendText(text)
  }

  /**
   * Gets key description
   */
  private _getKeyDescription(key: string): KeyDescription {
    const normalizedKey = normalizeKeyForOS(key, this._os)
    let description = keyMap.get(normalizedKey)
    assert(description, `Unknown key: "${normalizedKey}"`)

    // Use shifted version if Shift is pressed
    description =
      this._pressedModifiers.has('Shift') && description.shifted ? description.shifted : description

    // Don't send text for chords, except for Shift
    if (
      this._pressedModifiers.size > 1 ||
      (!this._pressedModifiers.has('Shift') && this._pressedModifiers.size === 1)
    ) {
      return { ...description, text: '' }
    }

    return description
  }

  /**
   * Returns current pressed modifiers
   */
  _modifiers(): Set<string> {
    return this._pressedModifiers
  }
}

/**
 * Creates a keyboard instance with platform detection
 */
export async function createKeyboard(debuggee: Debuggee): Promise<Keyboard> {
  const os = await getPlatform()
  return new Keyboard(debuggee, os)
}
