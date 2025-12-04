/**
 * @fileoverview PageElement operations
 */

import { Debuggee, BoundingBox } from '@/types'
import { BoxModel, DOMNode } from '@/types/cdp'
import { waitForCondition } from '@/utils'

/**
 * PageElement class for interacting with DOM elements
 */
export class PageElement {
  private debuggee: Debuggee

  constructor(
    private tabId: number,
    private selector: string
  ) {
    this.debuggee = { tabId }
  }

  /**
   * Waits for the element to exist
   */
  async waitForExist(options: { timeout?: number } = {}): Promise<void> {
    const { timeout = 30000 } = options

    await waitForCondition(
      async () => {
        try {
          const exists = await this.exists()
          return exists
        } catch {
          return false
        }
      },
      {
        timeout,
        interval: 100,
        errorMessage: `PageElement with selector "${this.selector}" not found within ${timeout}ms`,
      }
    )
  }

  /**
   * Checks if the element exists
   */
  async exists(): Promise<boolean> {
    try {
      await this.findElementNodeIds()
      return true
    } catch {
      return false
    }
  }

  /**
   * Gets the bounding box of the element
   */
  async getBoundingBox(): Promise<BoundingBox> {
    const { nodeId } = await this.findElementNodeIds()

    const { model } = (await chrome.debugger.sendCommand(this.debuggee, 'DOM.getBoxModel', {
      nodeId,
    })) as { model: BoxModel }

    // 盒模型内容的值是一个四边形顶点数组，每个点的 x 坐标后紧跟 y 坐标，按顺时针方向排列，e.g. [x1, y1, x2, y2, x3, y3, x4, y4]
    const [x1, y1, x2, y2, x3, y3, x4, y4] = model.content
    const xCoords = [x1, x2, x3, x4]
    const yCoords = [y1, y2, y3, y4]
    // 提取最小/最大 x 和 y 来获取边界框
    const x = Math.min(...xCoords)
    const y = Math.min(...yCoords)
    const width = Math.max(...xCoords) - x
    const height = Math.max(...yCoords) - y

    return { x, y, width, height }
  }

  /**
   * Gets the text content of the element
   */
  async getText(): Promise<string | undefined> {
    const { nodeId } = await this.findElementNodeIds()

    const { outerHTML } = (await chrome.debugger.sendCommand(this.debuggee, 'DOM.getOuterHTML', {
      nodeId,
    })) as { outerHTML: string }

    // Extract text using content script
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: this.tabId },
      func: (html: string) => {
        const parser = new DOMParser()
        const doc = parser.parseFromString(html, 'text/html')
        return doc.body.textContent || ''
      },
      args: [outerHTML],
    })

    return result
  }

  /**
   * Gets attribute value
   */
  async getAttributeValue(name: string): Promise<string | null> {
    const { nodeId } = await this.findElementNodeIds()

    try {
      const { attributes } = (await chrome.debugger.sendCommand(
        this.debuggee,
        'DOM.getAttributes',
        {
          nodeId,
        }
      )) as { attributes: string[] }

      for (let i = 0; i < attributes.length; i += 2) {
        if (attributes[i] === name) {
          return attributes[i + 1]
        }
      }

      return null
    } catch {
      return null
    }
  }

  /**
   * Scrolls the element into view
   */
  async scrollIntoView(): Promise<void> {
    const { nodeId } = await this.findElementNodeIds()

    await chrome.debugger.sendCommand(this.debuggee, 'DOM.scrollIntoViewIfNeeded', {
      nodeId,
    })
  }

  /**
   * Finds the element's node ids using the CSS selector
   */
  async findElementNodeIds(): Promise<{ nodeId: number; backendNodeId: number }> {
    // Query for the element
    const { root } = (await chrome.debugger.sendCommand(this.debuggee, 'DOM.getDocument', {
      depth: 1,
    })) as { root: DOMNode }
    const { nodeId } = (await chrome.debugger.sendCommand(this.debuggee, 'DOM.querySelector', {
      nodeId: root.nodeId,
      selector: this.selector,
    })) as { nodeId: number }

    if (!nodeId) {
      throw new Error(`PageElement not found with selector: ${this.selector}`)
    }

    const { node } = (await chrome.debugger.sendCommand(this.debuggee, 'DOM.describeNode', {
      nodeId,
    })) as { node: DOMNode }

    return { nodeId, backendNodeId: node.backendNodeId }
  }
}
