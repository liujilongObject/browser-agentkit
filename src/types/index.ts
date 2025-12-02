/**
 * Common types used across the SDK
 */

export * from './cdp'

export type Debuggee = chrome._debugger.DebuggerSession

export type TabInfo = chrome.tabs.Tab

export interface TabContext {
  tabId: number
  mainTabId?: number
  url?: string
  title?: string
}

export interface PageMetadata {
  title?: string
  description?: string
  url?: string
  image?: string
  [key: string]: string | undefined
}

export interface PageContent {
  html: string
  markdown?: string
  meta?: PageMetadata
  isPdf?: boolean
  resources?: unknown[]
}

export interface ScreenshotOptions {
  format?: 'png' | 'jpeg'
  quality?: number // [0..100] (jpeg only)
}

export interface KeyDescription {
  key: string
  keyCode: number
  keyCodeWithoutLocation: number
  code: string
  text: string
  location: number
  shifted?: KeyDescription
}

export interface MouseButton {
  button: 'left' | 'right' | 'middle' | 'none'
  clickCount?: number
}

export interface ViewportInfo {
  width: number
  height: number
  x: number
  y: number
}

export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TimeoutError'
  }
}
