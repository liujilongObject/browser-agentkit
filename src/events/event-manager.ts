/**
 * @fileoverview Event management system
 */

import { TabInfo } from '@/types'

export type EventCallback = (...args: unknown[]) => void

/**
 * Event Manager - Handles custom events and browser events
 */
export class EventManager {
  private listeners = new Map<string, Set<EventCallback>>()

  /**
   * Registers an event listener
   */
  on(eventName: string, callback: EventCallback): void {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set())
    }
    this.listeners.get(eventName)?.add(callback)
  }

  /**
   * Removes an event listener
   */
  off(eventName: string, callback: EventCallback): void {
    const listeners = this.listeners.get(eventName)
    if (listeners) {
      listeners.delete(callback)
    }
  }

  /**
   * Emits an event
   */
  emit(eventName: string, ...args: unknown[]): void {
    const listeners = this.listeners.get(eventName)
    if (listeners) {
      listeners.forEach((callback) => {
        callback(...args)
      })
    }
  }

  /**
   * Listens for tab created events
   */
  onTabCreated(callback: (tab: Partial<TabInfo>) => void): void {
    const listener = (tab: TabInfo) => {
      if (tab.id) {
        callback({
          id: tab.id,
          url: tab.url ?? '',
          title: tab.title ?? '',
          active: tab.active ?? false,
          windowId: tab.windowId,
          status: tab.status,
          pendingUrl: tab.pendingUrl,
        })
      }
    }

    chrome.tabs.onCreated.addListener(listener)
    this.on('cleanup', () => {
      chrome.tabs.onCreated.removeListener(listener)
    })
  }

  /**
   * Listens for tab removed events
   */
  onTabRemoved(callback: (tabId: number, removeInfo: chrome.tabs.OnRemovedInfo) => void): void {
    chrome.tabs.onRemoved.addListener(callback)
    this.on('cleanup', () => {
      chrome.tabs.onRemoved.removeListener(callback)
    })
  }

  /**
   * Listens for tab updated events
   */
  onTabUpdated(
    callback: (tabId: number, changeInfo: chrome.tabs.OnUpdatedInfo, tab: Partial<TabInfo>) => void
  ): void {
    const listener = (tabId: number, changeInfo: chrome.tabs.OnUpdatedInfo, tab: TabInfo) => {
      if (tab.id) {
        callback(tabId, changeInfo, {
          id: tab.id,
          url: tab.url ?? '',
          title: tab.title ?? '',
          active: tab.active ?? false,
          windowId: tab.windowId,
          status: tab.status,
          pendingUrl: tab.pendingUrl,
        })
      }
    }

    chrome.tabs.onUpdated.addListener(listener)
    this.on('cleanup', () => {
      chrome.tabs.onUpdated.removeListener(listener)
    })
  }

  /**
   * Listens for tab activated events
   */
  onTabActivated(callback: (activeInfo: chrome.tabs.OnActivatedInfo) => void): void {
    chrome.tabs.onActivated.addListener(callback)
    this.on('cleanup', () => {
      chrome.tabs.onActivated.removeListener(callback)
    })
  }

  /**
   * Listens for web request before send
   */
  onBeforeRequest(
    callback: (details: chrome.webRequest.OnBeforeRequestDetails) => undefined,
    filter?: chrome.webRequest.RequestFilter
  ): void {
    // @ts-nocheck
    const listener = (details: chrome.webRequest.OnBeforeRequestDetails) => callback(details)

    chrome.webRequest.onBeforeRequest.addListener(listener, filter ?? { urls: ['<all_urls>'] })

    this.on('cleanup', () => {
      chrome.webRequest.onBeforeRequest.removeListener(listener)
    })
  }

  /**
   * Listens for web request completed
   */
  onCompleted(
    callback: (details: chrome.webRequest.OnCompletedDetails) => void,
    filter?: chrome.webRequest.RequestFilter
  ): void {
    const listener = (details: chrome.webRequest.OnCompletedDetails) => {
      callback(details)
    }

    chrome.webRequest.onCompleted.addListener(listener, filter ?? { urls: ['<all_urls>'] })

    this.on('cleanup', () => {
      chrome.webRequest.onCompleted.removeListener(listener)
    })
  }

  /**
   * Cleans up all listeners
   */
  cleanup(): void {
    this.emit('cleanup')
    this.listeners.clear()
  }
}
