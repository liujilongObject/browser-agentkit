/**
 * @fileoverview Tab management utilities
 */

import { TabInfo } from '@/types'

/**
 * Tab Manager class
 */
export class TabManager {
  /**
   * Creates a new tab
   */
  async create(
    url: string,
    options: {
      active?: boolean
      windowId?: number
      index?: number
    } = {}
  ): Promise<TabInfo> {
    const { active = true, windowId, index } = options

    return await chrome.tabs.create({
      url,
      active,
      windowId,
      index,
    })
  }

  /**
   * Gets a tab by ID
   */
  async get(tabId: number): Promise<TabInfo> {
    return await chrome.tabs.get(tabId)
  }

  /**
   * Gets the active tab
   */
  async getActive(windowId?: number): Promise<TabInfo> {
    const [tab] = await chrome.tabs.query({
      active: true,
      windowId,
    })

    if (!tab) {
      throw new Error('No active tab found')
    }

    return tab
  }

  /**
   * Query tabs
   */
  async query(queryInfo: chrome.tabs.QueryInfo): Promise<TabInfo[]> {
    return await chrome.tabs.query(queryInfo)
  }

  /**
   * Closes a tab
   */
  async close(tabId: number): Promise<void> {
    await chrome.tabs.remove(tabId)
  }

  /**
   * Updates a tab
   */
  async update(
    tabId: number,
    updateProperties: chrome.tabs.UpdateProperties
  ): Promise<TabInfo | undefined> {
    return await chrome.tabs.update(tabId, updateProperties)
  }

  /**
   * Navigates to a URL
   */
  async navigate(tabId: number, url: string): Promise<TabInfo | undefined> {
    return this.update(tabId, { url })
  }

  /**
   * Goes back in history
   */
  async goBack(tabId: number): Promise<void> {
    await chrome.tabs.goBack(tabId)
  }

  /**
   * Goes forward in history
   */
  async goForward(tabId: number): Promise<void> {
    await chrome.tabs.goForward(tabId)
  }

  /**
   * Reloads a tab
   */
  async reload(tabId: number, bypassCache = false): Promise<void> {
    await chrome.tabs.reload(tabId, { bypassCache })
  }

  /**
   * Creates a hidden tab for background processing
   */
  async createHidden(url: string): Promise<TabInfo> {
    // Create a new window in minimized state with the tab
    const window = await chrome.windows.create({
      url,
      state: 'minimized',
      focused: false,
    })

    if (!window?.tabs?.[0]) {
      throw new Error('Failed to create hidden tab')
    }

    return window.tabs[0]
  }
}
