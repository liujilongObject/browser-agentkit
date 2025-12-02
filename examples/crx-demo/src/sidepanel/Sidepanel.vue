<script setup lang="ts">
import { ref } from 'vue'
import { browser, Page, events, ScrollDirection } from 'browser-agentkit'

const logs = ref<string[]>([])
const currentTabId = ref<number | null>(null)
const pageInstance = ref<Page | null>(null)

function log(message: string) {
  const time = new Date().toLocaleTimeString()
  logs.value.unshift(`[${time}] ${message}`)
  if (logs.value.length > 50) logs.value.pop()
}

// ==================== Browser Module ====================
async function openTab() {
  const tab = await browser.openTab('https://example.com')
  currentTabId.value = tab.id!
  log(`Opened tab: ${tab.id} - ${tab.url}`)
}

async function getCurrentTab() {
  const tab = await browser.getCurrentTab()
  currentTabId.value = tab.id!
  log(`Current tab: ${tab.id} - ${tab.url}`)
}

async function queryTabs() {
  const tabs = await browser.queryTabs({ currentWindow: true })
  log(`Found ${tabs.length} tabs in current window`)
}

async function navigateTab() {
  if (!currentTabId.value) {
    log('No tab selected')
    return
  }
  await browser.navigate(currentTabId.value, 'https://google.com')
  log(`Navigated tab ${currentTabId.value} to google.com`)
}

async function goBack() {
  if (!currentTabId.value) return
  await browser.goBack(currentTabId.value)
  log(`Tab ${currentTabId.value} went back`)
}

async function goForward() {
  if (!currentTabId.value) return
  await browser.goForward(currentTabId.value)
  log(`Tab ${currentTabId.value} went forward`)
}

async function reloadTab() {
  if (!currentTabId.value) return
  await browser.reload(currentTabId.value)
  log(`Tab ${currentTabId.value} reloaded`)
}

async function captureScreenshot() {
  if (!currentTabId.value) return
  try {
    const dataUrl = await browser.captureVisibleTab(currentTabId.value)
    log(`Screenshot captured (${dataUrl.length} chars)`)
    console.log('captureScreenshot: ', dataUrl)
  } catch(err) {
    console.warn('captureScreenshot error: ', err)
  }
}

async function closeTab() {
  if (!currentTabId.value) return
  await browser.closeTab(currentTabId.value)
  log(`Closed tab ${currentTabId.value}`)
  currentTabId.value = null
}

async function searchHistory() {
  const results = await browser.searchHistory('google')
  log(`History search found ${results.length} results`)
}

// ==================== Page Module ====================
async function initPage() {
  if (!currentTabId.value) {
    log('No tab selected')
    return
  }
  pageInstance.value = new Page(currentTabId.value)
  await pageInstance.value.initialize()
  log(`Page initialized for tab ${currentTabId.value}`)
}

async function pageClick() {
  if (!pageInstance.value) {
    log('Page not initialized')
    return
  }
  try {
    await pageInstance.value.click('a')
    log('Clicked first <a> element')
  } catch (e) {
    log(`Click failed: ${e}`)
  }
}

async function pageFill() {
  if (!pageInstance.value) {
    log('Page not initialized')
    return
  }
  try {
    await pageInstance.value.fill('input', 'Hello Browser AgentKit')
    log('Filled first input field')
  } catch (e) {
    log(`Fill failed: ${e}`)
  }
}

async function pageScroll(direction: 'up' | 'down') {
  if (!pageInstance.value) {
    log('Page not initialized')
    return
  }
  const dir = direction === 'up' ? ScrollDirection.UP : ScrollDirection.DOWN
  await pageInstance.value.scroll(dir, 500)
  log(`Scrolled ${direction}`)
}

async function waitForSelector() {
  if (!pageInstance.value) return
  try {
    await pageInstance.value.waitForSelector('body', { timeout: 3000 })
    log('Selector "body" found')
  } catch (e) {
    log(`Wait failed: ${e}`)
  }
}

async function pageCaptureScreenshot() {
  if (!pageInstance.value) {
    log('Page not initialized')
    return
  }
  try {
    const dataUrl = await pageInstance.value.captureVisible(currentTabId.value!)
    log(`Pge Screenshot captured (${dataUrl!.length} chars)`)
    console.log('pageCaptureScreenshot: ', `data:image/png;base64,${dataUrl}`)
  } catch(err) {
    console.warn('pageCaptureScreenshot error: ', err)
  }
}

async function closePage() {
  if (!pageInstance.value) return
  await pageInstance.value.close()
  pageInstance.value = null
  log('Page closed')
}

// ==================== Content Extraction ====================
async function getHTML() {
  if (!pageInstance.value) return
  const extractor = pageInstance.value.getContentExtractor()
  const html = await extractor.getHTML()
  log(`HTML length: ${html.length} chars`)
  console.log('getHTML: ', html)
}

async function getText() {
  if (!pageInstance.value) return
  const extractor = pageInstance.value.getContentExtractor()
  const text = await extractor.getText()
  log(`Text length: ${text.length} chars`)
  console.log('getText: ', text)
}

async function getMetadata() {
  if (!pageInstance.value) return
  const extractor = pageInstance.value.getContentExtractor()
  const meta = await extractor.getMetadata()
  log(`Metadata: title="${meta.title}", url="${meta.url}"`)
  console.log('getMetadata: ', meta)
}

async function checkPDF() {
  if (!pageInstance.value) return
  const extractor = pageInstance.value.getContentExtractor()
  const isPdf = await extractor.isPDF()
  log(`Is PDF: ${isPdf}`)
}

// ==================== Input Simulation ====================
async function keyboardType() {
  if (!pageInstance.value) return
  const keyboard = await pageInstance.value.getKeyboard()
  await keyboard.type('Hello World!')
  log('Typed "Hello World!"')
}

async function keyboardPress() {
  if (!pageInstance.value) return
  const keyboard = await pageInstance.value.getKeyboard()
  await keyboard.press('Enter')
  log('Pressed Enter')
}

async function keyboardShortcut() {
  if (!pageInstance.value) return
  const keyboard = await pageInstance.value.getKeyboard()
  await keyboard.press('ControlOrMeta+KeyA')
  log('Pressed Ctrl/Cmd+A')
}

async function mouseClick() {
  if (!pageInstance.value) return
  const mouse = await pageInstance.value.getMouse()
  await mouse.click(100, 100)
  log('Mouse clicked at (100, 100)')
}

async function mouseMove() {
  if (!pageInstance.value) return
  const mouse = await pageInstance.value.getMouse()
  await mouse.move(200, 200, { steps: 5 })
  log('Mouse moved to (200, 200)')
}

async function mouseWheel() {
  if (!pageInstance.value) return
  const mouse = await pageInstance.value.getMouse()
  await mouse.wheel(0, 100)
  log('Mouse wheel scrolled')
}

// ==================== Events ====================
function setupEventListeners() {
  events.onTabCreated(tab => {
    log(`Event: Tab created - ${tab.id}`)
  })
  events.onTabRemoved((tabId) => {
    log(`Event: Tab removed - ${tabId}`)
  })
  events.onTabUpdated((tabId, changeInfo) => {
    if (changeInfo.status === 'complete') {
      log(`Event: Tab ${tabId} loaded`)
    }
  })
  events.onTabActivated((activeInfo) => {
    log(`Event: Tab ${activeInfo.tabId} activated`)
  })
  log('Event listeners registered')
}

function clearLogs() {
  logs.value = []
}
</script>

<template>
  <main class="w-full px-4 py-5 text-gray-700">
    <h1 class="text-xl font-bold mb-4">Browser AgentKit Demo</h1>
    <p class="text-sm mb-4 text-gray-500">Current Tab ID: {{ currentTabId || 'None' }}</p>

    <div class="grid gap-4">
      <!-- Browser Module -->
      <fieldset class="border border-rd-lg p-3">
        <legend class="font-semibold px-2">🌐 Browser</legend>
        <div class="flex flex-wrap gap-2">
          <button class="btn" @click="openTab">Open Tab</button>
          <button class="btn" @click="getCurrentTab">Get Current</button>
          <button class="btn" @click="queryTabs">Query Tabs</button>
          <button class="btn" @click="navigateTab">Navigate</button>
          <button class="btn" @click="goBack">Back</button>
          <button class="btn" @click="goForward">Forward</button>
          <button class="btn" @click="reloadTab">Reload</button>
          <button class="btn" @click="captureScreenshot">Screenshot</button>
          <button class="btn" @click="searchHistory">Search History</button>
          <button class="btn bg-red-600 hover:bg-red-700" @click="closeTab">Close Tab</button>
        </div>
      </fieldset>

      <!-- Page Module -->
      <fieldset class="border border-rd-lg p-3">
        <legend class="font-semibold px-2">📄 Page</legend>
        <div class="flex flex-wrap gap-2">
          <button class="btn bg-green-600 hover:bg-green-700" @click="initPage">Initialize</button>
          <button class="btn" @click="pageClick">Click</button>
          <button class="btn" @click="pageFill">Fill Input</button>
          <button class="btn" @click="pageScroll('up')">Scroll Up</button>
          <button class="btn" @click="pageScroll('down')">Scroll Down</button>
          <button class="btn" @click="waitForSelector">Wait Selector</button>
          <button class="btn" @click="pageCaptureScreenshot">CaptureScreenshot</button>
          <button class="btn bg-red-600 hover:bg-red-700" @click="closePage">Close Page</button>
        </div>
      </fieldset>

      <!-- Content Extraction -->
      <fieldset class="border border-rd-lg p-3">
        <legend class="font-semibold px-2">📝 Content Extraction</legend>
        <div class="flex flex-wrap gap-2">
          <button class="btn" @click="getHTML">Get HTML</button>
          <button class="btn" @click="getText">Get Text</button>
          <button class="btn" @click="getMetadata">Get Metadata</button>
          <button class="btn" @click="checkPDF">Check PDF</button>
        </div>
      </fieldset>

      <!-- Input Simulation -->
      <fieldset class="border border-rd-lg p-3">
        <legend class="font-semibold px-2">⌨️ Input Simulation</legend>
        <div class="mb-2 text-sm text-gray-500">Keyboard</div>
        <div class="flex flex-wrap gap-2 mb-3">
          <button class="btn" @click="keyboardType">Type Text</button>
          <button class="btn" @click="keyboardPress">Press Enter</button>
          <button class="btn" @click="keyboardShortcut">Ctrl+A</button>
        </div>
        <div class="mb-2 text-sm text-gray-500">Mouse</div>
        <div class="flex flex-wrap gap-2">
          <button class="btn" @click="mouseClick">Click</button>
          <button class="btn" @click="mouseMove">Move</button>
          <button class="btn" @click="mouseWheel">Wheel</button>
        </div>
      </fieldset>

      <!-- Events -->
      <fieldset class="border border-rd-lg p-3">
        <legend class="font-semibold px-2">📡 Events</legend>
        <div class="flex flex-wrap gap-2">
          <button class="btn bg-purple-600 hover:bg-purple-700" @click="setupEventListeners">
            Register Listeners
          </button>
        </div>
      </fieldset>

      <!-- Logs -->
      <fieldset class="border border-rd-lg p-3">
        <legend class="font-semibold px-2">📋 Logs</legend>
        <div class="flex justify-end mb-2">
          <button class="btn bg-gray-600 hover:bg-gray-700 text-sm" @click="clearLogs">Clear</button>
        </div>
        <div class="bg-gray-100 rounded p-2 h-48 overflow-y-auto text-left text-xs font-mono">
          <div v-for="(logItem, index) in logs" :key="index" class="py-1 border-b border-gray-200">
            {{ logItem }}
          </div>
          <div v-if="logs.length === 0" class="text-gray-400">No logs yet...</div>
        </div>
      </fieldset>
    </div>
  </main>
</template>
