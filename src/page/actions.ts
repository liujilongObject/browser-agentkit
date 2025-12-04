/**
 * @fileoverview Page action implementations
 */

import { Debuggee } from '@/types'
import { RemoteObject, DOMNode, BoxModel } from '@/types/cdp'
import { createKeyboard } from '@/input/index'
import { PageElement } from '@/page/element'

export enum ScrollDirection {
  UP = 'UP',
  DOWN = 'DOWN',
  // LEFT = 'LEFT',
  // RIGHT = 'RIGHT',
}

/**
 * Resolves an AXNode selector to a DOM node ID
 * @param selector The selector can be any CSS selector or a string in the format `node=id`, e.g. `"node=123"`.
 */
async function resolveAxNode(
  tabId: number,
  selector: string
): Promise<{ nodeId: number; object: RemoteObject; debuggee: Debuggee }> {
  const debuggee: Debuggee = { tabId }
  // 支持 node='1234' 形式的直接传入 nodeId
  let nodeIdString = /node=['"](\d+)['"]/.exec(selector)?.[1]

  if (!nodeIdString) {
    const element = new PageElement(tabId, selector)
    nodeIdString = (await element.findElementNodeIds()).backendNodeId.toString()
  }

  const backendNodeId = Number(nodeIdString)

  // if (nodeIdString.includes(':')) {
  //   const [targetId, nodeNum] = nodeIdString.split(':')
  //   debuggee = { targetId }
  //   backendNodeId = Number(nodeNum)
  // } else {
  //   backendNodeId = Number(nodeIdString)
  // }

  await chrome.debugger.sendCommand(debuggee, 'DOM.getDocument', { depth: 1, pierce: true })
  const { object } = (await chrome.debugger.sendCommand(debuggee, 'DOM.resolveNode', {
    backendNodeId,
  })) as { object: RemoteObject }
  const { nodeId } = (await chrome.debugger.sendCommand(debuggee, 'DOM.requestNode', {
    objectId: object.objectId,
  })) as { nodeId: number }

  return { nodeId, object, debuggee }
}

/**
 * Calls a function on a remote object
 */
async function callFunctionOn(debuggee: Debuggee, objectId: string, fn: Function): Promise<any> {
  const res = (await chrome.debugger.sendCommand(debuggee, 'Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: fn.toString(),
    returnByValue: true,
    awaitPromise: true,
  })) as { result: RemoteObject }
  return res.result.value
}

/**
 * Page Actions class
 */
export class Actions {
  constructor(private tabId: number) {}

  /**
   * Clicks an element
   * @param selector The selector can be any CSS selector or a string in the format `node=id`, e.g. `"node=123"`.
   */
  async click(selector: string): Promise<void> {
    const { nodeId, object, debuggee } = await resolveAxNode(this.tabId, selector)
    const { node: nodeInfo } = (await chrome.debugger.sendCommand(debuggee, 'DOM.describeNode', {
      nodeId,
    })) as { node: DOMNode }

    // // 可处理`a`标签在新标签页中打开url的情况，改为在当前标签页导航操作
    // if (nodeInfo.nodeName === 'A' && nodeInfo.attributes) {
    //   let isNewTabLink = false
    //   let href = ''
    //   for (let i = 0; i < nodeInfo.attributes.length; i += 2) {
    //     const attr = nodeInfo.attributes[i]
    //     const value = nodeInfo.attributes[i + 1]
    //     if (attr === 'download' || (attr === 'target' && value === '_blank') || (attr === 'rel' && (value.includes('noopener') || value.includes('noreferrer')))) {
    //       isNewTabLink = true
    //     }
    //     if (attr === 'href' && value !== '#') {
    //       href = value
    //     }
    //   }
    //   if (isNewTabLink && href) {
    //     console.warn(`Switching click to navigate for ${href} on node ${JSON.stringify(nodeInfo)}`)
    //     // Navigate to the URL in the current tab
    //     return
    //   }
    // }

    // Handle special cases
    if (nodeInfo.nodeName === 'OPTION') {
      try {
        const result = await callFunctionOn(debuggee, object.objectId!, function () {
          // @ts-expect-error 预期类型错误，无须校验
          const select = this.closest('select')
          if (select) {
            // @ts-expect-error 预期类型错误，无须校验
            if (select.value !== this.value) {
              // @ts-expect-error 预期类型错误，无须校验
              select.value = this.value
              select.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
              select.dispatchEvent(new Event('change', { bubbles: true }))
            }
            return { error: null }
          }
          return { error: 'No parent SELECT found' }
        })
        if (result.error) {
          throw new Error(result.error)
        }
        return
      } catch (err) {
        console.warn('Failed to select option element, falling back to click', err)
      }
    }

    // Scroll into view
    try {
      await chrome.debugger.sendCommand(debuggee, 'DOM.scrollIntoViewIfNeeded', { nodeId })
      await new Promise((resolve) => setTimeout(resolve, 250))
    } catch (err) {
      console.warn('Failed to scroll node into view', err)
    }

    // Get element position and click
    let x = 0,
      y = 0
    try {
      const { model } = (await chrome.debugger.sendCommand(debuggee, 'DOM.getBoxModel', {
        nodeId,
      })) as { model: BoxModel }
      x = (model.content[0] + model.content[2]) / 2
      y = (model.content[1] + model.content[5]) / 2
    } catch (err) {
      // If box model fails, trigger click directly
      await callFunctionOn(debuggee, object.objectId!, function () {
        // @ts-expect-error 预期类型错误，无须校验
        this.click()
      })
      return
    }

    await chrome.debugger.sendCommand(debuggee, 'Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x,
      y,
      button: 'left',
      clickCount: 1,
    })
    await chrome.debugger.sendCommand(debuggee, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x,
      y,
      button: 'left',
      clickCount: 1,
    })
  }

  /**
   * Fills an input element
   * @param selector The selector can be any CSS selector or a string in the format `node=id`, e.g. `"node=123"`.
   */
  async fill(selector: string, value: string): Promise<void> {
    const { nodeId, debuggee } = await resolveAxNode(this.tabId, selector)

    try {
      await chrome.debugger.sendCommand(debuggee, 'DOM.focus', { nodeId })
    } catch {
      console.warn('Failed to focus element executing FILL action')
      return
    }

    const keyboard = await createKeyboard(debuggee)

    if (value === '') {
      await keyboard.press('ControlOrMeta+KeyA')
      await keyboard.press('Backspace')
      return
    }

    await keyboard.press('ControlOrMeta+KeyA')
    await keyboard.insertText(value)
  }

  /**
   * Searches by filling an input and pressing Enter
   * @param selector The selector can be any CSS selector or a string in the format `node=id`, e.g. `"node=123"`.
   */
  async search(selector: string, value: string): Promise<void> {
    await this.fill(selector, value)
    const { debuggee } = await resolveAxNode(this.tabId, selector)
    await chrome.debugger.sendCommand(debuggee, 'Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
      text: '\r',
    })
    await chrome.debugger.sendCommand(debuggee, 'Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
    })
  }

  /**
   * Scrolls the page
   */
  async scroll(direction: ScrollDirection, amount?: number): Promise<void> {
    const debuggee: Debuggee = { tabId: this.tabId }

    const [{ result: viewport }] = await chrome.scripting.executeScript({
      target: { tabId: this.tabId },
      func: () => ({ width: window.innerWidth, height: window.innerHeight }),
    })

    const centerX = (viewport?.width ?? 0) / 2
    const centerY = (viewport?.height ?? 0) / 2
    const scrollAmount = amount ?? Math.round((viewport?.height ?? 0) * 0.99)

    if (direction === ScrollDirection.DOWN) {
      await chrome.debugger.sendCommand(debuggee, 'Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        x: centerX,
        y: centerY,
        deltaX: 0,
        deltaY: scrollAmount,
      })
    } else if (direction === ScrollDirection.UP) {
      await chrome.debugger.sendCommand(debuggee, 'Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        x: centerX,
        y: centerY,
        deltaX: 0,
        deltaY: -scrollAmount,
      })
    }
  }

  /**
   * Waits for an element to appear
   * @param selector The selector can be any CSS selector or a string in the format `node=id`, e.g. `"node=123"`.
   */
  async waitForSelector(selector: string, options: { timeout?: number } = {}): Promise<void> {
    const { timeout = 30000 } = options
    const startTime = Date.now()

    while (Date.now() - startTime < timeout) {
      try {
        await resolveAxNode(this.tabId, selector)
        return
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
    }

    throw new Error(`Timeout waiting for selector: ${selector}`)
  }
}
