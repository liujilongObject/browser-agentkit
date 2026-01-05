/**
 * @fileoverview Page class for page operations
 */

import { Keyboard, Mouse, createKeyboard, createMouse } from '@/input'
import { Actions, ScrollDirection } from '@/page/actions'
import { Navigation } from '@/page/navigation'
import { PageElement } from '@/page/element'
import { ContentExtractor } from '@/content'
import { attachDebugger } from '@/utils'
import { Screenshot } from '@/browser/screenshot'

/**
 * Page - Main class for page operations
 */
export class Page {
  private actions: Actions
  private navigation: Navigation
  private keyboard: Keyboard | null = null
  private mouse: Mouse | null = null
  private detachDebugger: (() => Promise<void>) | null = null
  private screenshot: Screenshot

  constructor(private tabId: number) {
    this.actions = new Actions(tabId)
    this.navigation = new Navigation(tabId)
    this.screenshot = new Screenshot()
  }

  /**
   * Initializes the page
   * Attaches debugger and creates input handlers
   */
  async initialize(): Promise<void> {
    if (this.detachDebugger) {
      return // Already initialized
    }

    this.detachDebugger = await attachDebugger(this.tabId)
    const debuggee = { tabId: this.tabId }
    this.keyboard = await createKeyboard(debuggee)
    this.mouse = createMouse({ tabId: this.tabId }, this.keyboard)
  }

  /**
   * Cleans up resources
   */
  async close(): Promise<void> {
    if (this.detachDebugger) {
      await this.detachDebugger()
      this.detachDebugger = null
    }
    this.keyboard = null
    this.mouse = null
  }

  /**
   * Clicks on an element
   */
  async click(selector: string): Promise<void> {
    await this.initialize()
    await this.actions.click(selector)
  }

  /**
   * Fills an input field
   */
  async fill(selector: string, text: string, usePaste?: boolean): Promise<void> {
    await this.initialize()
    await this.actions.fill(selector, text, usePaste)
  }

  /**
   * Scrolls the page
   */
  async scroll(direction: ScrollDirection, amount?: number): Promise<void> {
    await this.initialize()
    await this.actions.scroll(direction, amount)
  }

  /**
   * Navigates to a URL
   */
  async navigate(url: string): Promise<void> {
    await this.initialize()
    await this.navigation.navigate(url)
  }

  /**
   * Waits for navigation to complete
   */
  async waitForNavigation(options: { timeout?: number } = {}): Promise<void> {
    await this.initialize()
    await this.navigation.waitForNavigation(options)
  }

  /**
   * Waits for a selector to appear
   */
  async waitForSelector(selector: string, options: { timeout?: number } = {}): Promise<void> {
    await this.initialize()
    await this.actions.waitForSelector(selector, options)
  }

  /**
   * Creates an PageElement object
   * @param selector any CSS selector
   */
  element(selector: string): PageElement {
    return new PageElement(this.tabId, selector)
  }

  /**
   * Gets the keyboard object
   */
  async getKeyboard(): Promise<Keyboard> {
    await this.initialize()
    if (!this.keyboard) {
      throw new Error('Keyboard not initialized')
    }
    return this.keyboard
  }

  /**
   * Gets the mouse object
   */
  async getMouse(): Promise<Mouse> {
    await this.initialize()
    if (!this.mouse) {
      throw new Error('Mouse not initialized')
    }
    return this.mouse
  }

  /**
   * Gets the content extractor
   */
  getContentExtractor(): ContentExtractor {
    return new ContentExtractor(this.tabId)
  }

  /**
   * Captures visible tab using debugger API
   */
  async captureVisible(
    tabId: number,
    options?: {
      format?: 'png' | 'jpeg' | 'webp'
      quality?: number // [0..100] (jpeg only)
    }
  ): Promise<string | undefined> {
    return this.screenshot.captureVisibleWithDebugger(tabId, options)
  }

  /**
   * Executes a script in the page context
   */
  async evaluate<T>(fn: (...args: unknown[]) => T, ...args: unknown[]): Promise<T> {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: this.tabId },
      func: fn,
      args,
    })
    return result as T
  }
}
