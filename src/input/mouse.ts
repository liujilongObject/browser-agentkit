/**
 * @fileoverview Mouse input simulation
 */

import { Debuggee, TabContext } from '@/types'
import { Keyboard } from './keyboard.js'
import { getModifiersBitmask } from '@/utils'

/**
 * DragManager - Handles drag and drop operations
 */
class DragManager {
  private tabContext: TabContext
  private debuggee: Debuggee
  private _dragState: unknown = null

  constructor(tabContext: TabContext) {
    this.tabContext = tabContext
    this.debuggee = { tabId: tabContext.tabId }
  }

  /**
   * Checks if dragging
   */
  isDragging(): boolean {
    return !!this._dragState
  }

  /**
   * Completes a drag operation by dropping
   */
  async drop(x: number, y: number, modifiers: Set<string>): Promise<void> {
    if (!this._dragState) {
      throw new Error('Missing drag state')
    }

    await chrome.debugger.sendCommand(this.debuggee, 'Input.dispatchDragEvent', {
      type: 'drop',
      x,
      y,
      data: this._dragState,
      modifiers: getModifiersBitmask(modifiers),
    })

    this._dragState = null
  }

  /**
   * Intercepts drag events caused by mouse move
   */
  async interceptDragCausedByMove(
    x: number,
    y: number,
    button: string,
    modifiers: Set<string>,
    moveEvent: () => Promise<void>
  ): Promise<void> {
    if (this._dragState) {
      await chrome.debugger.sendCommand(this.debuggee, 'Input.dispatchDragEvent', {
        type: 'dragOver',
        x,
        y,
        data: this._dragState,
        modifiers: getModifiersBitmask(modifiers),
      })
      return
    }

    if (button !== 'left') {
      return moveEvent()
    }

    let dragDataPromiseResolver: (value: unknown) => void
    const dragDataPromise = new Promise<unknown>((resolve) => {
      dragDataPromiseResolver = resolve
    })

    const onDragIntercepted = (source: Debuggee, method: string, params: unknown) => {
      if (source.tabId === this.tabContext.tabId && method === 'Input.dragIntercepted') {
        dragDataPromiseResolver(params)
      }
    }

    // This function is injected into the page to detect if a drag was initiated
    function setupDragDetection() {
      let dragStartedPromise = Promise.resolve(false)
      let dragEvent: Event | null = null
      const setDragEvent = (e: Event) => (dragEvent = e)
      const listenForDrag = () => {
        dragStartedPromise = new Promise((resolve) => {
          window.addEventListener('dragstart', setDragEvent, { once: true, capture: true })
          setTimeout(() => {
            resolve(dragEvent ? !dragEvent.defaultPrevented : false)
          }, 0)
        })
      }
      window.addEventListener('mousemove', listenForDrag, { once: true, capture: true })

      // @ts-expect-error 预期类型错误，无须校验
      window.__cleanupDrag = async () => {
        const result = await dragStartedPromise
        window.removeEventListener('mousemove', listenForDrag, { capture: true })
        window.removeEventListener('dragstart', setDragEvent, { capture: true })
        delete (window as any).__cleanupDrag
        return result
      }
    }

    await chrome.scripting.executeScript({
      target: { tabId: this.tabContext.tabId, allFrames: true },
      func: setupDragDetection,
      world: 'MAIN',
    })

    chrome.debugger.onEvent.addListener(onDragIntercepted)
    await chrome.debugger.sendCommand(this.debuggee, 'Input.setInterceptDrags', { enabled: true })

    await moveEvent()

    const results = await chrome.scripting.executeScript({
      target: { tabId: this.tabContext.tabId, allFrames: true },
      func: () => (window as any).__cleanupDrag?.(),
      world: 'MAIN',
    })
    const dragStarted = results.some((r) => r.result === true)

    // @ts-expect-error 预期类型错误，无须校验
    this._dragState = dragStarted ? (await dragDataPromise).data : null

    chrome.debugger.onEvent.removeListener(onDragIntercepted)
    await chrome.debugger.sendCommand(this.debuggee, 'Input.setInterceptDrags', { enabled: false })

    if (this._dragState) {
      await chrome.debugger.sendCommand(this.debuggee, 'Input.dispatchDragEvent', {
        type: 'dragEnter',
        x,
        y,
        data: this._dragState,
        modifiers: getModifiersBitmask(modifiers),
      })
    }
  }
}

/**
 * RawMouse - Low-level mouse implementation
 */
class RawMouse {
  private debuggee: Debuggee

  private _dragManager: DragManager

  constructor(tabContext: TabContext) {
    this.debuggee = { tabId: tabContext.tabId }
    this._dragManager = new DragManager(tabContext)
  }

  /**
   * Moves the mouse
   */
  async move(
    x: number,
    y: number,
    button: string,
    buttons: Set<string>,
    modifiers: Set<string>,
    forClick?: boolean
  ): Promise<void> {
    const moveEvent = async () => {
      await chrome.debugger.sendCommand(this.debuggee, 'Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        button,
        buttons: getButtonsBitmask(buttons),
        x,
        y,
        modifiers: getModifiersBitmask(modifiers),
      })
    }

    if (forClick) {
      return moveEvent()
    }

    // Handle potential drag-and-drop interception
    await this._dragManager.interceptDragCausedByMove(x, y, button, modifiers, moveEvent)
  }

  /**
   * Presses a mouse button down
   */
  async down(
    x: number,
    y: number,
    button: string,
    buttons: Set<string>,
    modifiers: Set<string>,
    clickCount: number
  ): Promise<void> {
    if (this._dragManager.isDragging()) return

    await chrome.debugger.sendCommand(this.debuggee, 'Input.dispatchMouseEvent', {
      type: 'mousePressed',
      button,
      buttons: getButtonsBitmask(buttons),
      x,
      y,
      modifiers: getModifiersBitmask(modifiers),
      clickCount,
    })
  }

  /**
   * Releases a mouse button
   */
  async up(
    x: number,
    y: number,
    button: string,
    buttons: Set<string>,
    modifiers: Set<string>,
    clickCount: number
  ): Promise<void> {
    if (this._dragManager.isDragging()) {
      await this._dragManager.drop(x, y, modifiers)
      return
    }

    await chrome.debugger.sendCommand(this.debuggee, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      button,
      buttons: getButtonsBitmask(buttons),
      x,
      y,
      modifiers: getModifiersBitmask(modifiers),
      clickCount,
    })
  }

  /**
   * Sends a mouse wheel event
   */
  async wheel(
    x: number,
    y: number,
    modifiers: Set<string>,
    deltaX: number,
    deltaY: number
  ): Promise<void> {
    await chrome.debugger.sendCommand(this.debuggee, 'Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x,
      y,
      modifiers: getModifiersBitmask(modifiers),
      deltaX,
      deltaY,
    })
  }
}

/**
 * Mouse - High-level mouse simulation
 */
export class Mouse {
  private _keyboard: Keyboard
  private _x = 0
  private _y = 0
  private _lastButton = 'none'
  private _buttons = new Set<string>()
  private _raw: RawMouse

  constructor(tabContext: TabContext, keyboard: Keyboard) {
    this._keyboard = keyboard
    this._raw = new RawMouse(tabContext)
  }

  /**
   * Moves the mouse
   */
  async move(
    x: number,
    y: number,
    options: { steps?: number; forClick?: boolean } = {}
  ): Promise<void> {
    const { steps = 1 } = options
    const startX = this._x
    const startY = this._y
    this._x = x
    this._y = y

    for (let i = 1; i <= steps; i++) {
      const newX = startX + (x - startX) * (i / steps)
      const newY = startY + (y - startY) * (i / steps)
      await this._raw.move(
        newX,
        newY,
        this._lastButton,
        this._buttons,
        this._keyboard._modifiers(),
        !!options.forClick
      )
    }
  }

  /**
   * Presses a mouse button down
   */
  async down(options: { button?: string; clickCount?: number } = {}): Promise<void> {
    const { button = 'left', clickCount = 1 } = options
    this._lastButton = button
    this._buttons.add(button)
    await this._raw.down(
      this._x,
      this._y,
      this._lastButton,
      this._buttons,
      this._keyboard._modifiers(),
      clickCount
    )
  }

  /**
   * Releases a mouse button
   */
  async up(options: { button?: string; clickCount?: number } = {}): Promise<void> {
    const { button = 'left', clickCount = 1 } = options
    this._lastButton = 'none'
    this._buttons.delete(button)
    await this._raw.up(
      this._x,
      this._y,
      button,
      this._buttons,
      this._keyboard._modifiers(),
      clickCount
    )
  }

  /**
   * Clicks at a position
   */
  async click(
    x: number,
    y: number,
    options: { delay?: number; clickCount?: number; button?: string } = {}
  ): Promise<void> {
    const { delay = null, clickCount = 1, button = 'left' } = options

    if (delay) {
      await this.move(x, y, { forClick: true })
      for (let i = 1; i <= clickCount; ++i) {
        await this.down({ button, clickCount: i })
        await new Promise((resolve) => setTimeout(resolve, delay))
        await this.up({ button, clickCount: i })
        if (i < clickCount) {
          await new Promise((resolve) => setTimeout(resolve, delay))
        }
      }
    } else {
      const promises: Promise<void>[] = []
      promises.push(this.move(x, y, { forClick: true }))
      for (let i = 1; i <= clickCount; ++i) {
        promises.push(this.down({ button, clickCount: i }))
        promises.push(this.up({ button, clickCount: i }))
      }
      await Promise.all(promises)
    }
  }

  /**
   * Double-clicks at a position
   */
  async dblclick(
    x: number,
    y: number,
    options: { delay?: number; button?: string } = {}
  ): Promise<void> {
    await this.click(x, y, { ...options, clickCount: 2 })
  }

  /**
   * Scrolls using the mouse wheel
   */
  async wheel(deltaX: number, deltaY: number): Promise<void> {
    await this._raw.wheel(this._x, this._y, this._keyboard._modifiers(), deltaX, deltaY)
  }
}

/**
 * Helper to get buttons bitmask
 */
function getButtonsBitmask(buttons: Set<string>): number {
  let mask = 0
  if (buttons.has('left')) mask |= 1
  if (buttons.has('right')) mask |= 2
  if (buttons.has('middle')) mask |= 4
  return mask
}

/**
 * Creates a mouse instance
 */
export function createMouse(tabContext: TabContext, keyboard: Keyboard): Mouse {
  return new Mouse(tabContext, keyboard)
}
