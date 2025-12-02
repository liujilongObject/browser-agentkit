// https://chromedevtools.github.io/devtools-protocol/tot/Accessibility/#method-getFullAXTree
export interface AxTree {
  nodes: AxNode[]
}

// https://chromedevtools.github.io/devtools-protocol/tot/Accessibility/#type-AXNode
export interface AxNode {
  nodeId: string
  ignored?: boolean
  parentId?: string
  childIds?: string[]
  backendDOMNodeId: number
  frameId?: string
  role?: AxValue
  name?: AxValue
  description?: AxValue
  value?: AxValue
  properties?: {
    name: string
    value: AxValue
  }[]
}

// https://chromedevtools.github.io/devtools-protocol/tot/Accessibility/#type-AXValueType
export interface AxValue {
  type: string
  value?: unknown
}

// https://chromedevtools.github.io/devtools-protocol/tot/DOM/#type-Node
export interface DOMNode {
  nodeId: number
  backendNodeId: number
  parentId?: number
  frameId?: string
  attributes?: string[]
  nodeType?: number
  nodeName?: string
  localName?: string
  nodeValue?: string
}

// https://chromedevtools.github.io/devtools-protocol/tot/Runtime/#type-RemoteObject
export interface RemoteObject {
  type: string
  subtype?: string
  className?: string
  value?: unknown
  description?: string
  objectId?: string
}

// https://chromedevtools.github.io/devtools-protocol/tot/DOM/#method-getBoxModel
export interface BoxModel {
  content: number[]
  padding: number[]
  border: number[]
  margin: number[]
  width: number
  height: number
}

// https://chromedevtools.github.io/devtools-protocol/tot/DOMSnapshot/#method-captureSnapshot
export interface DOMSnapshot {
  documents: DocumentSnapshot[]
  strings: string[]
}

// https://chromedevtools.github.io/devtools-protocol/tot/DOMSnapshot/#type-DocumentSnapshot
export interface DocumentSnapshot {
  documentURL: number
  title: number
  baseURL: number
  contentLanguage: number
  publicId: number
  systemId: number
  frameId: number
  textBoxes: {
    layoutIndex: number[]
    bounds: [number, number, number, number][]
    start: number[]
    length: number[]
  }
  nodes: NodeTreeSnapshot
  layout: {
    nodeIndex: number[]
    styles: number[][]
  }
}

export interface NodeTreeSnapshot {
  parentIndex: number[]
  nodeType: number[]
  nodeName: number[]
  nodeValue: number[]
  backendNodeId: number[]
  attributes: number[][]
  textValue: {
    index: number[]
    value: number[]
  }
  inputValue: {
    index: number[]
    value: number[]
  }
  contentDocumentIndex: {
    index: number[]
    value: number[]
  }
  shadowRootType: {
    index: number[]
    value: number[]
  }
  inputChecked: {
    index: number[]
  }
  optionSelected: {
    index: number[]
  }
  isClickable: {
    index: number[]
  }
  // Other properties omitted for brevity
}
