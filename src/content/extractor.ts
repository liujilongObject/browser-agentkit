/**
 * @fileoverview Main content extractor class
 */

import { PageContent, PageMetadata, TabContext, BoundingBox } from '@/types'
import { AxNode, RemoteObject, BoxModel } from '@/types/cdp'
import { analyzeSnapshot, captureSnapshot } from '@/content/dom-parser'
import {
  getOriginAXTree,
  axTreeToHtml,
  getAxNodeProperty,
  getAxNodeValue,
} from '@/content/accessibility'

/**
 * 获取指定节点的事件监听器
 * @param {object} tabContext - The agent tab context
 * @param {number[]} backendNodeIds - Array of backend node IDs to check
 * @returns {Promise<Map>} Map of backendNodeId to event types
 */
async function getEventListeners(tabContext: TabContext, backendNodeIds: number[]) {
  const { tabId } = tabContext
  const listenerMap = new Map()

  const batchSize = 20
  for (let i = 0; i < backendNodeIds.length; i += batchSize) {
    const batch = backendNodeIds.slice(i, i + batchSize)

    const promises = batch.map(async (backendNodeId) => {
      try {
        // 获取远程对象引用
        const { object } = (await chrome.debugger.sendCommand({ tabId }, 'DOM.resolveNode', {
          backendNodeId,
        })) as { object: RemoteObject }

        if (object.objectId) {
          // 获取对象的事件监听器
          const { listeners } = (await chrome.debugger.sendCommand(
            { tabId },
            'DOMDebugger.getEventListeners',
            { objectId: object.objectId }
          )) as { listeners: { type: string }[] }

          if (listeners?.length) {
            // 记录该节点的事件类型
            const eventTypes = listeners.map((l) => l.type)
            listenerMap.set(backendNodeId, eventTypes)
          }

          // 释放远程对象
          await chrome.debugger.sendCommand({ tabId }, 'Runtime.releaseObject', {
            objectId: object.objectId,
          })
        }
      } catch (error) {
        console.debug('Error getting event listeners for node', backendNodeId, error)
      }
    })

    await Promise.all(promises)
  }

  return listenerMap
}

/**
 * 获取当前页面的视口尺寸
 * @param {object} tabContext - The agent tab context.
 * @returns {Promise<{width: number, height: number, x: number, y: number}>} 视口尺寸.
 */
async function getViewportDimensions(tabContext: TabContext) {
  const { tabId } = tabContext
  // https://chromedevtools.github.io/devtools-protocol/tot/Page/#method-getLayoutMetrics
  const layoutMetrics = (await chrome.debugger.sendCommand(
    { tabId },
    'Page.getLayoutMetrics',
    {}
  )) as {
    cssVisualViewport: {
      clientWidth: number
      clientHeight: number
      offsetX: number
      offsetY: number
    }
  }

  // 用 CSS 像素表示的视口尺寸
  const viewport = layoutMetrics.cssVisualViewport
  return {
    width: viewport.clientWidth,
    height: viewport.clientHeight,
    x: viewport.offsetX,
    y: viewport.offsetY,
  } as BoundingBox
}

/**
 * 获取可访问性节点列表的边界框.
 * @param {object} tabContext - The agent tab context.
 * @param {object[]} axNodes - 可访问性节点列表.
 * @returns {Promise<Map<string, {x: number, y: number, width: number, height: number}>>} 存储节点 ID 和对应边界框的映射.
 */
async function getNodeBoundingBoxes(tabContext: TabContext, axNodes: AxNode[]) {
  const { tabId } = tabContext
  const boundingBoxes = new Map<string, BoundingBox>()

  // 仅过滤具有 backendDOMNodeId 且可能可见/可交互的节点
  const nodesWithId = axNodes.filter(
    (node) =>
      node.backendDOMNodeId &&
      // 优先考虑可能出现在视口中的节点
      // - Focusable elements (buttons, links, inputs)
      (getAxNodeProperty(node, 'focusable') === 'true' ||
        // - 用户可交互的节点
        ['button', 'link', 'checkbox', 'radio', 'combobox', 'textbox', 'menuitem'].includes(
          getAxNodeValue(node.role)
        ) ||
        // - 有明确名称的节点
        node.name?.value !== '' ||
        node.backendDOMNodeId)
  )

  // 批量处理节点
  const batchSize = 50
  for (let i = 0; i < nodesWithId.length; i += batchSize) {
    const batch = nodesWithId.slice(i, i + batchSize)

    // 单独处理每个节点
    // https://chromedevtools.github.io/devtools-protocol/tot/DOM/#method-getBoxModel
    const promises = batch.map(async (node) => {
      try {
        const result = (await chrome.debugger.sendCommand({ tabId }, 'DOM.getBoxModel', {
          backendNodeId: node.backendDOMNodeId,
        })) as { model: BoxModel }

        if (result.model.content) {
          const [x, y, width, height] = extractBoxDimensions(result.model.content)
          boundingBoxes.set(node.nodeId, { x, y, width, height })
        }
      } catch (error) {
        // 跳过可能没有盒模型的节点
        console.debug('Error getting box model for node', node.nodeId, error)
      }
    })

    await Promise.all(promises)
  }

  return boundingBoxes
}

/**
 * 从盒模型内容中提取盒子尺寸
 * @param {number[]} points - 盒模型内容
 * @returns {number[]} 盒子尺寸 [x, y, width, height]
 */
function extractBoxDimensions(points: number[]): [number, number, number, number] {
  // 盒模型内容的值是一个四边形顶点数组，每个点的 x 坐标后紧跟 y 坐标，按顺时针方向排列，e.g. [x1, y1, x2, y2, x3, y3, x4, y4]
  // 提取最小/最大 x 和 y 来获取边界框
  const xCoords = [points[0], points[2], points[4], points[6]]
  const yCoords = [points[1], points[3], points[5], points[7]]

  const x = Math.min(...xCoords)
  const y = Math.min(...yCoords)
  const width = Math.max(...xCoords) - x
  const height = Math.max(...yCoords) - y

  return [x, y, width, height]
}

/**
 * Content Extractor - Main class for extracting content from pages
 */
export class ContentExtractor {
  constructor(private tabId: number) {}

  /**
   * Gets page snapshot with HTML and metadata
   */
  async getPageSnapshot(options: { viewportOnly?: boolean } = {}): Promise<PageContent> {
    const { viewportOnly = false } = options

    // Capture DOM snapshot and accessibility tree in parallel
    const [snapshot, axTree] = await Promise.all([
      captureSnapshot(this.tabId),
      getOriginAXTree({ tabId: this.tabId }),
    ])

    // Analyze snapshot
    const { isPdf, meta, cursorPointerNodes } = analyzeSnapshot(snapshot, {})

    // 所有需要检查事件监听器的节点 ID
    const backendNodeIds = Array.from(
      new Set([
        ...Array.from(cursorPointerNodes.keys()),
        ...axTree.nodes
          .filter((node) => node.backendDOMNodeId)
          .map((node) => node.backendDOMNodeId),
      ])
    )

    const tabContext: TabContext = { tabId: this.tabId }
    // 获取点击事件监听器映射
    const eventListenerMap = await getEventListeners(tabContext, backendNodeIds)

    let viewportFilter:
      | { viewportInfo: BoundingBox; nodeBoundingBoxes: Map<string, BoundingBox> }
      | undefined = undefined

    // 如果设置了 viewportOnly，则获取视口尺寸和节点边界框
    if (viewportOnly) {
      const viewportInfo = await getViewportDimensions(tabContext)
      const nodeBoundingBoxes = await getNodeBoundingBoxes(tabContext, axTree.nodes)
      viewportFilter = { viewportInfo, nodeBoundingBoxes }
    }

    // Convert accessibility tree to HTML
    const html = await axTreeToHtml(
      {
        tabId: this.tabId,
      },
      axTree.nodes,
      cursorPointerNodes,
      eventListenerMap,
      undefined,
      viewportFilter
    )

    return {
      html,
      meta,
      isPdf,
      resources: [],
    }
  }

  /**
   * Gets HTML content
   */
  async getHTML(options: { viewportOnly?: boolean } = {}): Promise<string> {
    const content = await this.getPageSnapshot(options)
    return content.html
  }

  /**
   * Gets text content from HTML
   */
  async getText(): Promise<string> {
    const html = await this.getHTML()
    // Remove HTML tags and get plain text
    return html
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  /**
   * Gets page metadata
   */
  async getMetadata(): Promise<PageMetadata> {
    const content = await this.getPageSnapshot()
    return content.meta ?? {}
  }

  /**
   * Gets element content by selector
   * This requires injecting a content script
   */
  async getElementContent(selector: string): Promise<{ html: string; text: string }> {
    const results = await chrome.scripting.executeScript({
      target: { tabId: this.tabId },
      func: (sel: string) => {
        const element = document.querySelector(sel)
        if (!element) {
          return { html: '', text: '' }
        }
        return {
          html: element.innerHTML,
          text: element.textContent ?? '',
        }
      },
      args: [selector],
    })

    return results[0]?.result ?? { html: '', text: '' }
  }

  /**
   * Checks if current page is a PDF
   */
  async isPDF(): Promise<boolean> {
    const snapshot = await captureSnapshot(this.tabId)
    const { isPdf } = analyzeSnapshot(snapshot, {})
    return isPdf
  }
}
