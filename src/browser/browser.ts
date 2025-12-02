/**
 * @fileoverview Main Browser class
 */

import { TabInfo, ScreenshotOptions } from '@/types'
import { TabManager } from '@/browser/tab-manager'
import { Screenshot } from '@/browser/screenshot'

/**
 * Browser - Main class for browser operations
 */
export class Browser {
  private tabManager: TabManager
  private screenshot: Screenshot

  constructor() {
    this.tabManager = new TabManager()
    this.screenshot = new Screenshot()
  }

  /**
   * Opens a new tab
   */
  async openTab(
    url: string,
    options: {
      active?: boolean
      windowId?: number
      index?: number
    } = {}
  ): Promise<TabInfo> {
    return this.tabManager.create(url, options)
  }

  /**
   * Gets a tab by ID
   */
  async getTab(tabId: number): Promise<TabInfo> {
    return this.tabManager.get(tabId)
  }

  /**
   * Gets the current active tab
   */
  async getCurrentTab(windowId?: number): Promise<TabInfo> {
    return this.tabManager.getActive(windowId)
  }

  /**
   * Query tabs
   */
  async queryTabs(queryInfo: chrome.tabs.QueryInfo = {}): Promise<TabInfo[]> {
    return this.tabManager.query(queryInfo)
  }

  /**
   * Searches browser history
   */
  async searchHistory(request: chrome.history.HistoryQuery) {
    const results = await chrome.history.search(request)

    const resultMap = new Map()
    const seenIds = new Set()

    for (const item of results) {
      if (seenIds.has(item.id)) continue

      seenIds.add(item.id)

      let url = item.url ?? ''
      if (url.endsWith('/')) {
        url = url.slice(0, -1)
      }
      if (!url) continue

      const existing = resultMap.get(url)
      resultMap.set(url, {
        url,
        title: existing?.title ?? item.title ?? '',
        last_accessed: Math.max(existing?.last_accessed ?? 0, item.lastVisitTime ?? Date.now()),
        visit_count: (existing?.visit_count ?? 0) + (item.visitCount ?? 1),
      })
    }

    return [...resultMap.values()]
  }

  /**
   * Closes a tab
   */
  async closeTab(tabId: number): Promise<void> {
    return this.tabManager.close(tabId)
  }

  /**
   * Navigates to a URL
   */
  async navigate(tabId: number, url: string): Promise<TabInfo | undefined> {
    return this.tabManager.navigate(tabId, url)
  }

  /**
   * Goes back in browser history
   */
  async goBack(tabId: number): Promise<void> {
    return this.tabManager.goBack(tabId)
  }

  /**
   * Goes forward in browser history
   */
  async goForward(tabId: number): Promise<void> {
    return this.tabManager.goForward(tabId)
  }

  /**
   * Reloads a tab
   */
  async reload(tabId: number, bypassCache = false): Promise<void> {
    return this.tabManager.reload(tabId, bypassCache)
  }

  /**
   * Captures screenshot of visible tab
   */
  async captureVisibleTab(tabId: number, options?: ScreenshotOptions): Promise<string> {
    return this.screenshot.captureVisible(tabId, options)
  }

  /**
   * Captures full page screenshot
   */
  // async captureFullPage(tabId: number): Promise<string> {
  //   return this.screenshot.captureFullPage(tabId)
  // }

  /**
   * Creates a hidden tab for background processing
   */
  async createHiddenTab(url: string): Promise<TabInfo> {
    return this.tabManager.createHidden(url)
  }
}
