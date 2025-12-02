/**
 * @fileoverview DOM parsing and snapshot utilities
 */

import { PageMetadata, Debuggee } from '@/types'
import { DOMSnapshot, DocumentSnapshot, NodeTreeSnapshot } from '@/types/cdp'

const NODE_TYPES = { ELEMENT_NODE: 1, TEXT_NODE: 3, DOCUMENT_FRAGMENT_NODE: 11 }

/**
 * Creates property maps from snapshot
 */
function createSnapshotPropertyMaps(snapshot: DocumentSnapshot) {
  const textValueMap = new Map<number, number>()
  snapshot.nodes.textValue.index.forEach((nodeIndex: number, i: number) => {
    textValueMap.set(nodeIndex, snapshot.nodes.textValue.value[i])
  })

  const inputValueMap = new Map<number, number>()
  snapshot.nodes.inputValue.index.forEach((nodeIndex: number, i: number) => {
    inputValueMap.set(nodeIndex, snapshot.nodes.inputValue.value[i])
  })

  const contentDocumentIndexMap = new Map<number, number>()
  snapshot.nodes.contentDocumentIndex.index.forEach((nodeIndex: number, i: number) => {
    contentDocumentIndexMap.set(nodeIndex, snapshot.nodes.contentDocumentIndex.value[i])
  })

  const shadowRootTypeMap = new Map<number, number>()
  snapshot.nodes.shadowRootType.index.forEach((nodeIndex: number, i: number) => {
    shadowRootTypeMap.set(nodeIndex, snapshot.nodes.shadowRootType.value[i])
  })

  const layoutMap = new Map<number, number>()
  snapshot.layout.nodeIndex.forEach((nodeIndex: number, i: number) => {
    layoutMap.set(nodeIndex, i)
  })

  return {
    textValueMap,
    inputValueMap,
    contentDocumentIndexMap,
    shadowRootTypeMap,
    layoutMap,
    optionSelectedSet: new Set(snapshot.nodes.optionSelected.index),
    isClickableSet: new Set(snapshot.nodes.isClickable.index),
    inputCheckedSet: new Set(snapshot.nodes.inputChecked.index),
  }
}

/**
 * Builds node data from snapshot
 */
function buildNodeData(
  nodeIndex: number,
  snapshot: DocumentSnapshot,
  maps: ReturnType<typeof createSnapshotPropertyMaps>
) {
  const nodeType = snapshot.nodes.nodeType[nodeIndex]
  if (
    ![NODE_TYPES.ELEMENT_NODE, NODE_TYPES.TEXT_NODE, NODE_TYPES.DOCUMENT_FRAGMENT_NODE].includes(
      nodeType
    )
  ) {
    return
  }

  let layoutIndex = maps.layoutMap.get(nodeIndex) ?? -1
  // Text nodes must have a layout to be included
  if (nodeType === NODE_TYPES.TEXT_NODE && layoutIndex === -1) {
    layoutIndex = snapshot.textBoxes.layoutIndex[nodeIndex]
    if (layoutIndex === undefined) return
  }

  return {
    attributes: snapshot.nodes.attributes[nodeIndex],
    nodeType,
    nodeName: snapshot.nodes.nodeName[nodeIndex],
    nodeValue: snapshot.nodes.nodeValue[nodeIndex],
    backendNodeId: snapshot.nodes.backendNodeId[nodeIndex],
    parentIndex: snapshot.nodes.parentIndex[nodeIndex],
    optionSelected: maps.optionSelectedSet.has(nodeIndex),
    isClickable: maps.isClickableSet.has(nodeIndex),
    inputChecked: maps.inputCheckedSet.has(nodeIndex),
    shadowRootType: maps.shadowRootTypeMap.get(nodeIndex),
    inputValue: maps.inputValueMap.get(nodeIndex),
    textValue: maps.textValueMap.get(nodeIndex),
    contentDocumentIndex: maps.contentDocumentIndexMap.get(nodeIndex),
    layoutIndex,
  }
}

/**
 * Process snapshot into node and children maps
 */
function processSnapshot(snapshot: DocumentSnapshot) {
  const nodeMap = new Map<number, ReturnType<typeof buildNodeData>>()
  const childrenMap = new Map<number, number[]>()
  const propertyMaps = createSnapshotPropertyMaps(snapshot)

  snapshot.nodes.parentIndex.forEach((parentIndex: number, nodeIndex: number) => {
    const nodeData = buildNodeData(nodeIndex, snapshot, propertyMaps)
    if (!nodeData) return

    nodeMap.set(nodeIndex, nodeData)
    if (parentIndex < 0) return // Root node

    const children = childrenMap.get(parentIndex) ?? []
    children.push(nodeIndex)
    childrenMap.set(parentIndex, children)
  })

  return { nodeMap, childrenMap }
}

/**
 * Parse node attributes from snapshot
 */
function parseNodeAttributes(
  snapshot: DOMSnapshot,
  node: ReturnType<typeof buildNodeData>
): Map<string, string> {
  const attributesMap = new Map<string, string>()
  const attributes = node?.attributes ?? []
  for (let i = 0; i < attributes.length; i += 2) {
    const keyIndex = attributes[i]
    const valueIndex = attributes[i + 1]
    const key = snapshot.strings[keyIndex]?.toLowerCase() ?? ''
    const value = snapshot.strings[valueIndex] ?? ''
    attributesMap.set(key, value)
  }
  return attributesMap
}

/**
 * Analyze snapshot to extract metadata and detect PDF
 */
export function analyzeSnapshot(snapshot: DOMSnapshot, pageInfo: { mimeType?: string } = {}) {
  const getString = (index: number) => snapshot.strings[index] ?? ''

  const mainDocument = snapshot.documents[0]
  if (!mainDocument) {
    return {
      meta: {},
      isPdf: pageInfo.mimeType === 'application/pdf',
      cursorPointerNodes: new Map<number, string>(),
    }
  }

  const { nodeMap, childrenMap } = processSnapshot(mainDocument)

  const isPdf = (): boolean => {
    const htmlNodeIndex = childrenMap.get(0)?.[0]
    if (!htmlNodeIndex) return false
    const bodyNodeIndex = childrenMap.get(htmlNodeIndex)?.[1]
    if (!bodyNodeIndex) return false
    const embedNodeIndex = childrenMap.get(bodyNodeIndex)?.[0]
    if (!embedNodeIndex) return false
    const embedNode = nodeMap.get(embedNodeIndex)
    if (!embedNode) return false

    const attributes = embedNode.attributes.map(getString)
    return (
      attributes.includes('application/pdf') ||
      attributes.includes('application/x-pdf') ||
      attributes.includes('application/x-google-chrome-pdf')
    )
  }

  const extractMeta = () => {
    const metaTags: PageMetadata = {}
    const htmlNodeIndex = childrenMap.get(0)?.[0]
    if (!htmlNodeIndex) return metaTags
    const headNodeIndex = childrenMap.get(htmlNodeIndex)?.[0]
    if (!headNodeIndex) return metaTags
    const headChildren = childrenMap.get(headNodeIndex)
    if (!headChildren?.length) return metaTags

    for (const childIndex of headChildren) {
      const node = nodeMap.get(childIndex)
      if (!node || getString(node.nodeName).toUpperCase() !== 'META') continue

      const attrs = parseNodeAttributes(snapshot, node)
      const property = attrs.get('property')?.toLowerCase()
      const name = attrs.get('name')?.toLowerCase()
      const content = attrs.get('content')

      if ((property?.startsWith('og:') || name === 'description') && content) {
        const key = property?.replace('og:', '') ?? name
        if (key) metaTags[key] = content
      }
    }
    return metaTags
  }

  const findCursorPointerNodes = () => {
    const pointerNodes = new Map<number, string>()
    const childrenMap = new Map<number, number[]>()

    snapshot.documents.forEach(({ nodes }) => {
      if (!nodes.parentIndex) return

      nodes.parentIndex.forEach((parentIndex: number, nodeIndex: number) => {
        if (parentIndex < 0) return

        const children = childrenMap.get(parentIndex) || []
        children.push(nodeIndex)
        childrenMap.set(parentIndex, children)
      })
    })

    const processedBackendIds = new Set<number>()

    snapshot.documents.forEach(({ nodes, layout }) => {
      layout.nodeIndex.forEach((nodeIndex: number, i: number) => {
        const [styleIndex] = layout.styles[i]
        if (snapshot.strings[styleIndex] !== 'pointer') return

        const backendNodeId = nodes.backendNodeId[nodeIndex]
        if (!backendNodeId) return

        const nodeName = (snapshot.strings[nodes.nodeName[nodeIndex]] ?? 'div').toLowerCase()
        pointerNodes.set(backendNodeId, nodeName)
        processedBackendIds.add(backendNodeId)

        markChildrenInteractive(nodes, nodeIndex, childrenMap, pointerNodes, processedBackendIds)
      })
    })

    return pointerNodes
  }

  function markChildrenInteractive(
    nodes: NodeTreeSnapshot,
    parentNodeIndex: number,
    childrenMap: Map<number, number[]>,
    pointerNodes: Map<number, string>,
    processedBackendIds: Set<number>
  ) {
    const children = childrenMap.get(parentNodeIndex)
    if (!children) return

    for (const childIndex of children) {
      const childBackendId = nodes.backendNodeId[childIndex]
      if (!childBackendId || processedBackendIds.has(childBackendId)) continue

      const nodeName = (snapshot.strings[nodes.nodeName[childIndex]] ?? 'div').toLowerCase()
      pointerNodes.set(childBackendId, nodeName)
      processedBackendIds.add(childBackendId)

      markChildrenInteractive(nodes, childIndex, childrenMap, pointerNodes, processedBackendIds)
    }
  }

  const detectedPdf = isPdf()
  const meta = extractMeta()
  const cursorPointerNodes = findCursorPointerNodes()

  return { meta, isPdf: detectedPdf, cursorPointerNodes }
}

/**
 * Capture DOM snapshot
 */
export async function captureSnapshot(tabId: number): Promise<DOMSnapshot> {
  const debuggee: Debuggee = { tabId }
  const snapshot = await chrome.debugger.sendCommand(debuggee, 'DOMSnapshot.captureSnapshot', {
    computedStyles: ['cursor'],
    includePaintOrder: false,
    includeDOMRects: false,
    includeBlendedBackgroundColors: false,
    includeTextColorOpacities: false,
  })
  return snapshot as DOMSnapshot
}
