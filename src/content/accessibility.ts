/**
 * @fileoverview Accessibility tree processing
 */

import { TabContext, BoundingBox, Debuggee } from '@/types'
import { AxTree, AxNode, AxValue, DOMNode } from '@/types/cdp'
import { attachToIframe } from '@/utils/debugger'

// Maps AXTree roles to HTML tags.
const AX_ROLE_TO_HTML_TAG = {
  link: 'a',
  checkbox: 'input',
  radio: 'input',
  textbox: 'input',
  searchbox: 'input',
  switch: 'input',
  slider: 'input',
  spinbutton: 'input',
  combobox: 'select',
  heading: 'h2', // Default, can be overridden by level
  paragraph: 'p',
  list: 'ul',
  listitem: 'li',
  row: 'tr',
  cell: 'td',
  columnheader: 'th',
  rowheader: 'th',
  WebRoot: 'body',
  RootWebArea: 'body',
  MenuListPopup: 'menu',
  dialog: 'div',
  radiogroup: 'fieldset',
  WebArea: 'iframe',
  Iframe: 'iframe',
  generic: 'div',
  banner: 'header',
  navigation: 'nav',
  contentinfo: 'footer',
  complementary: 'aside',
  region: 'section',
  search: 'div',
  image: 'img',
  separator: 'hr',
  LabelText: 'label',
  strong: 'b',
  DisclosureTriangle: 'details',
  default: 'div',
}

// HTML tags that are self-closing.
const SELF_CLOSING_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
])

// The attribute name used to store the AXNode ID in the simplified HTML.
const AX_NODE_ID_ATTRIBUTE = 'node'

/**
 * Gets the origin accessibility tree
 */
export async function getOriginAXTree(
  target: Debuggee,
  params: Record<string, unknown> = {}
): Promise<AxTree> {
  const fullAXTree = await chrome.debugger.sendCommand(
    target,
    'Accessibility.getFullAXTree',
    params
  )
  return fullAXTree as AxTree
}

/**
 * The main function to convert a full Accessibility Tree to a simplified HTML string.
 * @param {object} tabContext - The agent tab context.
 * @param {object[]} axNodes - The array of nodes from `getFullAXTree`.
 * @param {Map} cursorPointerNodes - Map of nodes with `cursor: pointer`.
 * @param {Map} eventListenerMap - Map of backendNodeId to event types.
 * @param {string} [frameContextId] - The ID of the frame being parsed (for nested iframes).
 * @param {object} [viewportFilter] - 仅视口模式的过滤器设置
 * @param {object} [viewportFilter.viewportInfo] - 视口尺寸信息
 * @param {Map} [viewportFilter.nodeBoundingBoxes] - 存储节点 ID 和对应边界框的映射
 * @returns {Promise<string>} The simplified HTML string.
 */
export async function axTreeToHtml(
  tabContext: TabContext,
  axNodes: AxNode[],
  cursorPointerNodes: Map<number, string>,
  eventListenerMap: Map<number, string[]>,
  frameContextId?: string,
  viewportFilter?: {
    viewportInfo: BoundingBox
    nodeBoundingBoxes: Map<string, BoundingBox>
  }
) {
  const nodeMap = new Map(axNodes.map((node) => [node.nodeId, node]))
  const rootNode = axNodes.find((node) => !node.parentId)
  if (!rootNode) return ''

  const visited = new Map<string, AxNode>()

  // 可见节点 ID 集合
  const visibleNodeIds = new Set<string>()
  const hasViewportFilter = !!(viewportFilter?.viewportInfo && viewportFilter.nodeBoundingBoxes)
  if (hasViewportFilter) {
    const { viewportInfo, nodeBoundingBoxes } = viewportFilter

    // 标记视口中直接可见的所有节点
    for (const [nodeId, box] of nodeBoundingBoxes.entries()) {
      if (isNodeInViewport(box, viewportInfo)) {
        visibleNodeIds.add(nodeId)

        // 将所有祖先标记为可见，以保持完整的树结构
        let currentNode = nodeMap.get(nodeId)
        while (currentNode?.parentId) {
          visibleNodeIds.add(currentNode.parentId)
          currentNode = nodeMap.get(currentNode.parentId)
        }
      }
    }

    // 处理特殊情况：
    // 1. 如果 `select` 元素可见，则将其所有子孙节点标记为可见
    const nodesToProcess = [...visibleNodeIds]
    for (const nodeId of nodesToProcess) {
      const node = nodeMap.get(nodeId)
      // 如果 `select`是可见的，则将其所有子孙节点标记为可见
      if (node && getAxNodeValue(node.role) === 'combobox') {
        const queue = node.childIds ? [...node.childIds] : []
        while (queue.length > 0) {
          const descendantId = queue.shift()
          if (descendantId && !visibleNodeIds.has(descendantId)) {
            visibleNodeIds.add(descendantId)
            const descendantNode = nodeMap.get(descendantId)
            if (descendantNode?.childIds) {
              queue.push(...descendantNode.childIds)
            }
          }
        }
      }
    }
  }

  async function buildHtmlRecursive(axNode: AxNode): Promise<string> {
    if (visited.has(axNode.nodeId)) return ''
    visited.set(axNode.nodeId, axNode)

    // 当设置了视口过滤时，跳过不可见的节点
    if (hasViewportFilter && !visibleNodeIds.has(axNode.nodeId)) {
      return ''
    }

    const role = getAxNodeValue(axNode.role)
    if (role === 'StaticText') {
      return getAxNodeValue(axNode.name) || ''
    }

    const isCursorPointer = cursorPointerNodes.has(axNode.backendDOMNodeId)

    // 检查是否有点击事件监听器
    const hasClickListener =
      eventListenerMap.has(axNode.backendDOMNodeId) &&
      eventListenerMap
        .get(axNode.backendDOMNodeId)
        ?.some((type) => ['click', 'mousedown', 'mouseup'].includes(type))

    // 是否为交互式元素
    const isInteractiveElement = isCursorPointer || hasClickListener

    const isIgnoredNode = [
      'LayoutTable',
      'LayoutTableRow',
      'LayoutTableCell',
      'LineBreak',
      'InlineTextBox',
      'presentation',
      'none',
    ].includes(role)

    if (getAxNodeProperty(axNode, 'hidden') === 'true') return ''

    // 对于被忽略的节点，且没有交互性，直接渲染其子节点
    if (!isInteractiveElement && (isIgnoredNode || axNode.ignored)) {
      return await buildChildrenHtml(axNode)
    }

    if (['ListMarker'].includes(role)) {
      return getAxNodeValue(axNode.name)
    }

    const parentNode = axNode.parentId ? visited.get(axNode.parentId) : undefined
    const attributes: string[] = []
    addAriaProperties(axNode, attributes, parentNode)

    // 若元素是通用角色且无属性和值，且非交互式节点，则仅渲染其子节点: 去除冗余的标签包裹
    const isGeneric = role === 'generic' || role === 'group'
    if (
      isGeneric &&
      attributes.length === 0 &&
      !getAxNodeValue(axNode.name) &&
      !isInteractiveElement
    ) {
      return await buildChildrenHtml(axNode)
    }

    // 如果元素是交互式的（包含 cursor:pointer 或点击事件监听器），
    // 优先使用其原始标签名称，而不是转换为通用 div
    const tag = isInteractiveElement
      ? (cursorPointerNodes.get(axNode.backendDOMNodeId) ??
        getTagNameForAxNode(role, axNode, parentNode))
      : isIgnoredNode
        ? 'div'
        : getTagNameForAxNode(role, axNode, parentNode)

    // Add type attributes for inputs
    if (tag === 'input') {
      if (role === 'checkbox' || role === 'switch') attributes.push('type="checkbox"')
      else if (role === 'radio') attributes.push('type="radio"')
      else if (role === 'searchbox') attributes.push('type="search"')
      else if (role === 'slider') attributes.push('type="range"')
      else if (role === 'spinbutton') attributes.push('type="number"')
    }

    if (axNode.value !== undefined && tag !== 'textarea' && tag !== 'div') {
      const value = getAxNodeValue(axNode.value)
      if (value) attributes.push(`value="${escapeHTML(value)}"`)
    }

    if (!isIgnoredNode && !isGeneric && role && isRoleRedundant(tag, role)) {
      attributes.push(`role="${role}"`)
    }

    let childrenHtml = ''
    if (tag === 'iframe') {
      // 解析 iframe 内容
      childrenHtml =
        (await parseIframe(
          tabContext,
          axNode,
          cursorPointerNodes,
          eventListenerMap,
          viewportFilter
        )) || ''
    } else {
      childrenHtml = await buildChildrenHtml(axNode)
    }

    const label = getAxNodeValue(axNode.name)
    if (label) {
      if (!childrenHtml && !SELF_CLOSING_TAGS.has(tag)) {
        childrenHtml = label
      } else if (isRedundantLabel(tag, label, childrenHtml)) {
        if (tag === 'img') {
          attributes.push(`alt="${escapeHTML(label)}"`)
        } else {
          attributes.push(`aria-label="${escapeHTML(label)}"`)
        }
      }
    }

    if (!childrenHtml && !attributes.length) {
      return ''
    }

    // 如果以下任一条件成立，则标记为可交互：
    // 1. 元素可聚焦（来自无障碍树）
    // 2. 元素具有直接或继承的 `cursor:pointer` 样式
    // 3. 元素具有与点击相关的事件监听器
    if (
      (getAxNodeProperty(axNode, 'focusable') === 'true' || isInteractiveElement) &&
      axNode.backendDOMNodeId
    ) {
      const nodeId = frameContextId
        ? `${frameContextId}:${axNode.backendDOMNodeId}`
        : axNode.backendDOMNodeId
      attributes.push(`${AX_NODE_ID_ATTRIBUTE}="${nodeId}"`)
    }

    const attrString = attributes.length ? ` ${attributes.join(' ')}` : ''

    if (SELF_CLOSING_TAGS.has(tag)) {
      return `<${tag}${attrString}/>`
    }
    // An iframe with content is rendered as a nested document, not an iframe tag with children.
    if (tag === 'iframe' && childrenHtml) {
      return childrenHtml
    }

    return `<${tag}${attrString}>${childrenHtml}</${tag}>`
  }

  async function buildChildrenHtml(axNode: AxNode): Promise<string> {
    if (!axNode.childIds?.length) return ''
    const childrenHtmlParts: string[] = []
    let lastChildWasInline = false
    for (const childId of axNode.childIds) {
      const childNode = nodeMap.get(childId)
      if (childNode) {
        const childHtml = await buildHtmlRecursive(childNode)
        if (childHtml) {
          const isInline = !childHtml.startsWith('<')
          // Add a line break between adjacent inline text nodes for readability.
          if (isInline && lastChildWasInline && childrenHtmlParts.length > 0) {
            childrenHtmlParts.push('<br>')
          }
          childrenHtmlParts.push(childHtml)
          lastChildWasInline = isInline
        }
      }
    }
    return childrenHtmlParts.join('')
  }

  return buildHtmlRecursive(rootNode)
}

/**
 * Gets the string value from an AXNode value object.
 * @param {object} axValue - The AXNode value object.
 * @returns {string}
 */
export function getAxNodeValue(axValue?: AxValue): string {
  return !axValue || axValue.type === 'valueUndefined' ? '' : String(axValue.value || '')
}

/**
 * Finds and returns the value of a specific property from an AXNode.
 * @param {object} axNode - The Accessibility Node.
 * @param {string} propertyName - The name of the property to find.
 * @returns {string}
 */
export function getAxNodeProperty(axNode: AxNode, propertyName: string): string {
  if (!axNode.properties) return ''
  const prop = axNode.properties.find((p) => p.name === propertyName)
  return prop ? getAxNodeValue(prop.value) : ''
}

/**
 * Determines the appropriate HTML tag name for a given AXNode role.
 * @param {string} role - The AXNode role.
 * @param {object} axNode - The AXNode itself.
 * @param {object} parentAxNode - The parent AXNode.
 * @returns {string} The corresponding HTML tag name.
 */
function getTagNameForAxNode(role: string, axNode: AxNode, parentAxNode?: AxNode): string {
  let tag = AX_ROLE_TO_HTML_TAG[role as keyof typeof AX_ROLE_TO_HTML_TAG] || 'div'

  if (role === 'heading') {
    const level = parseInt(getAxNodeProperty(axNode, 'level')) || 2
    if (level >= 1 && level <= 6) {
      tag = `h${level}`
    }
  }

  const isParentEditable = parentAxNode && getAxNodeProperty(parentAxNode, 'editable')
  const isNodeEditable = getAxNodeProperty(axNode, 'editable')

  if (!isParentEditable && isNodeEditable) {
    if (isNodeEditable === 'richtext') return 'div'
    return getAxNodeProperty(axNode, 'multiline') ? 'textarea' : 'input'
  }

  return tag
}

/**
 * Checks if a role attribute is redundant for a given HTML tag.
 * @param {string} tag - The HTML tag name.
 * @param {string} role - The AXNode role.
 * @returns {boolean} True if the role is redundant.
 */
function isRoleRedundant(tag: string, role: string): boolean {
  return !(
    role === tag ||
    AX_ROLE_TO_HTML_TAG[role as keyof typeof AX_ROLE_TO_HTML_TAG] === tag ||
    (tag === 'select' && role === 'combobox') ||
    (tag === 'textarea' && role === 'textbox') ||
    (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag) && role === 'heading')
  )
}

/**
 * Adds ARIA and other properties from an AXNode to an attributes array.
 * @param {object} axNode - The AXNode.
 * @param {string[]} attributes - The array to push attributes into.
 * @param {object} parentAxNode - The parent AXNode.
 */
function addAriaProperties(axNode: AxNode, attributes: string[], parentAxNode?: AxNode) {
  if (!axNode.properties) return

  for (const prop of axNode.properties) {
    const name = prop.name
    const value = getAxNodeValue(prop.value)

    switch (name) {
      case 'disabled':
      case 'readonly':
      case 'required':
      case 'checked':
      case 'selected':
        if (value === 'true') attributes.push(name)
        break

      case 'busy':
      case 'invalid':
      case 'atomic':
      case 'multiselectable':
      case 'expanded':
      case 'modal':
      case 'pressed':
        if (value === 'true') attributes.push(`aria-${name}="true"`)
        break

      case 'placeholder':
      case 'keyshortcuts':
      case 'roledescription':
      case 'live':
      case 'relevant':
      case 'autocomplete':
      case 'hasPopup':
      case 'valuemin':
      case 'valuemax':
      case 'valuetext':
      case 'errormessage':
        if (value) attributes.push(`aria-${name.toLowerCase()}="${value}"`)
        break

      case 'focused':
        if (value === 'true') attributes.push('aria-current="true"')
        break

      case 'url':
        if (
          value &&
          !value.startsWith('data:') &&
          !value.startsWith('blob:') &&
          !value.startsWith('file:')
        ) {
          const href = value.startsWith('javascript:') ? '#' : value
          if (getAxNodeValue(axNode.role) === 'image') {
            attributes.push(`src="${escapeHTML(href)}"`)
          }
          // else if (getAxNodeValue(axNode.role) === 'link') {
          //   // a 标签 href 超过长度限制时做截断处理
          //   const limitHref =
          //     href.length > 100 ? href.substring(0, href.indexOf('?')) : href
          //   attributes.push(`href="${escapeHTML(limitHref)}"`)
          // }
          else {
            attributes.push(`href="${escapeHTML(href)}"`)
          }
        }
        break

      case 'editable':
        if (
          value === 'richtext' &&
          !(parentAxNode && getAxNodeProperty(parentAxNode, 'editable'))
        ) {
          attributes.push('contenteditable="true"')
        }
        break

      case 'hiddenRoot':
        if (value === 'true') attributes.push('aria-hidden="true"')
        break
    }
  }
}

/**
 * Checks if a label is redundant given the child content.
 * @param {string} tag - The HTML tag.
 * @param {string} label - The label text.
 * @param {string} childHtml - The rendered HTML of the children.
 * @returns {boolean}
 */
function isRedundantLabel(tag: string, label: string, childHtml: string): boolean {
  if (SELF_CLOSING_TAGS.has(tag)) return true

  const childText = childHtml
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, '')
    .toLowerCase()
  const existingLabels = (childHtml.match(/(aria-label|alt)="([^"]*)"/g) || [])
    .map((match) => match.replace(/(aria-label|alt)="([^"]*)"/g, '$2'))
    .join('')
    .replace(/\s+/g, '')
    .toLowerCase()

  const normalizedLabel = label.replace(/\s+/g, '').toLowerCase()

  return !childText.includes(normalizedLabel) && !existingLabels.includes(normalizedLabel)
}

/**
 * Escapes HTML special characters.
 * @param {string} str - The string to escape.
 * @returns {string}
 */
function escapeHTML(str: string): string {
  return str.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * 检查节点在视口中是否可见
 * @param {object} box - 节点的边界框
 * @param {object} viewport - 视口尺寸
 * @param {boolean} [checkHorizontal=true] - 是否检查水平可见性, 默认不检查
 * @returns {boolean} 节点是否在视口中至少部分可见
 */
function isNodeInViewport(box: BoundingBox, viewport: BoundingBox, checkHorizontal = false) {
  if (!box) return false

  // 垂直方向的交叉检查
  const noVerticalOverlap =
    box.y >= viewport.height || // 盒子完全位于视口下方
    box.y + box.height <= 0 // 盒子完全位于视口上方

  // 如果垂直方向没有交叉，则直接返回false
  if (noVerticalOverlap) return false

  // 是否需要检查水平方向: 部分网页可能出现水平滚动条导致元素不可见
  if (checkHorizontal) {
    const noHorizontalOverlap =
      box.x >= viewport.width || // 盒子完全位于视口右侧
      box.x + box.width <= 0 // 盒子完全位于视口左侧
    return !noHorizontalOverlap
  }

  // 如果不检查水平方向，只要垂直方向有交叉就返回true
  return true
}

/**
 * Recursively parses an iframe by switching to its debugger target.
 * @param {object} tabContext - The agent tab context.
 * @param {object} axNode - The iframe AXNode.
 * @param {Map} cursorPointerNodes - Map of nodes with `cursor: pointer`.
 * @param {Map} eventListenerMap - Map of backendNodeId to event types.
 * @param {object} [viewportFilter] - Filter settings for viewport-only mode.
 * @returns {Promise<string|null>} The parsed HTML of the iframe content.
 */
async function parseIframe(
  tabContext: TabContext,
  axNode: AxNode,
  cursorPointerNodes: Map<number, string>,
  eventListenerMap: Map<number, string[]>,
  viewportFilter?: {
    viewportInfo: BoundingBox
    nodeBoundingBoxes: Map<string, BoundingBox>
  }
): Promise<string | null> {
  if (!axNode.backendDOMNodeId) return null

  // 尝试多次重试直到获取完整的无障碍树
  const getPopulatedAxTree = async (getTreeFn: () => Promise<AxTree>) => {
    let attempts = 0
    const maxAttempts = 4
    const retryDelay = 300

    let lastResult: AxTree = { nodes: [] }
    while (attempts < maxAttempts) {
      lastResult = await getTreeFn()
      if (lastResult.nodes && lastResult.nodes.length > 2) {
        return lastResult // 成功获取完整树
      }

      attempts++
      if (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay * attempts))
      }
    }
    return lastResult // 返回最后的结果（可能为空）
  }

  try {
    const { node } = (await chrome.debugger.sendCommand(
      { tabId: tabContext.tabId },
      'DOM.describeNode',
      { backendNodeId: axNode.backendDOMNodeId, depth: -1 }
    )) as { node: DOMNode }

    if (!node.frameId) {
      console.info('Skipping iframe without frameId to prevent recursion', { node })
      return null
    }

    try {
      // 同源情况下可直接获取 iframe 的无障碍树
      // const getAXTree: Promise<{}> = () =>
      //   chrome.debugger.sendCommand({ tabId: tabContext.tabId }, 'Accessibility.getFullAXTree', {
      //     frameId: node.frameId,
      //   })
      const { nodes } = await getPopulatedAxTree(() =>
        getOriginAXTree({ tabId: tabContext.tabId }, { frameId: node.frameId })
      )
      return await axTreeToHtml(
        tabContext,
        nodes,
        cursorPointerNodes,
        eventListenerMap,
        undefined,
        viewportFilter
      )
    } catch (e) {
      // 如果获取失败，可能是跨域 iframe，附加一个新的调试器目标
      const src = node.attributes?.findIndex((attr) => attr === 'src')
      const url = src !== undefined && src !== -1 ? node.attributes?.[src + 1] : undefined
      console.info('Switched to new target for iframe:', { error: e, url, node })

      const iframeDebuggee = await attachToIframe(node.frameId)
      const { nodes } = await getPopulatedAxTree(() =>
        getOriginAXTree({ targetId: iframeDebuggee.targetId })
      )
      return await axTreeToHtml(
        tabContext,
        nodes,
        cursorPointerNodes,
        eventListenerMap,
        iframeDebuggee.targetId,
        viewportFilter
      )
    }
  } catch (error) {
    console.error('Error describing iframe node:', { error, axNode })
  }
  return null
}
