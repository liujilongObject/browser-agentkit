/**
 * @fileoverview Browser Agent Kit - Main entry point
 */

export { Browser, TabManager } from './browser'
export { Page, Actions, ScrollDirection, Navigation, PageElement } from './page'
export { ContentExtractor } from './content'
export { EventManager } from './events'
export { Keyboard, createKeyboard, Mouse, createMouse } from './input'

export type {
  TabInfo,
  TabContext,
  PageContent,
  PageMetadata,
  ScreenshotOptions,
  BoundingBox,
  ViewportInfo,
  Debuggee,
} from './types'

export { TimeoutError } from './types'

export { waitForCondition, retry, withTimeout, getPlatform, isMac, isWindows } from './utils'

// Default Instances
import { Browser } from './browser'
import { EventManager } from './events'

/**
 * Default browser instance
 *
 * @example
 * ```typescript
 * import { browser } from 'browser-agentkit';
 *
 * const tab = await browser.openTab('https://example.com');
 * const page = new Page(tab.id);
 * await page.click('#button');
 * ```
 */
export const browser = new Browser()

/**
 * Default event manager instance
 *
 * @example
 * ```typescript
 * import { events } from 'browser-agentkit';
 *
 * events.onTabCreated((tab) => {
 *   console.log('Tab created:', tab.url);
 * });
 * ```
 */
export const events = new EventManager()
