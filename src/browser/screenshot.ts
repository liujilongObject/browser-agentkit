/**
 * @fileoverview Screenshot capture utilities
 */

import { ScreenshotOptions } from '@/types'

/**
 * Resizes a screenshot if device pixel ratio is not 1
 */
async function resizeScreenshot(tabId: number, base64Png: string): Promise<string | undefined> {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (base64Data: string) => {
      return new Promise<string>((resolve) => {
        const dpr = window.devicePixelRatio
        if (dpr === 1) {
          resolve(base64Data)
          return
        }
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement('canvas')
          canvas.width = img.width / dpr
          canvas.height = img.height / dpr
          const ctx = canvas.getContext('2d')
          ctx?.drawImage(img, 0, 0, canvas.width, canvas.height)
          const resizedData = canvas.toDataURL('image/png').split(',')[1]
          resolve(resizedData)
        }
        img.src = `data:image/png;base64,${base64Data}`
      })
    },
    args: [base64Png],
  })
  return result
}

/**
 * Screenshot capture class
 */
export class Screenshot {
  /**
   * Captures visible tab using debugger API
   */
  async captureVisibleWithDebugger(
    tabId: number,
    options: {
      format?: 'png' | 'jpeg' | 'webp'
      quality?: number // [0..100] (jpeg only)
    } = {}
  ): Promise<string | undefined> {
    const target = { tabId }
    const { format = 'png', quality = 50 } = options
    const result = (await chrome.debugger.sendCommand(target, 'Page.captureScreenshot', {
      format,
      quality,
      fromSurface: true,
    })) as { data: string }
    return resizeScreenshot(tabId, result.data)
  }

  /**
   * Captures visible area of a window
   */
  async captureVisible(tabId: number, options: ScreenshotOptions = {}): Promise<string> {
    const { format = 'png', quality = 100 } = options

    // Get window ID from tab
    const tab = await chrome.tabs.get(tabId)
    if (!tab.windowId) {
      throw new Error('Tab has no window ID')
    }

    return await chrome.tabs.captureVisibleTab(tab.windowId, {
      format,
      quality,
    })
  }

  /**
   * TODO:
   * full implementation would require:
   *  1. Get page dimensions
   *  2. Scroll and capture multiple screenshots
   *  3. Stitch them together
   * Captures full page screenshot
   * This is more complex and requires scrolling
   */
  // async captureFullPage(tabId: number): Promise<string> {
  //   return this.captureVisible(tabId)
  // }
}
