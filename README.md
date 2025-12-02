# Browser AgentKit SDK

A powerful SDK for Chrome extensions to interact with browsers and web pages. Simplifies browser automation, web scraping, and page interaction tasks.

## Features

- 🎯 **CDP-Powered** - Direct Chrome DevTools Protocol integration for fine-grained browser control
- 🔒 **Stable & Reliable** - CDP provides deterministic, low-level operations without DOM injection
- 🚀 **Easy to Use** - Simple, intuitive API design
- 🌐 **Comprehensive** - Browser control, page interactions, content extraction
- 🎨 **Flexible** - Support for keyboard, mouse, and complex interactions
- 📦 **Lightweight** - Minimal dependencies, no external browser binaries required

## Why Browser AgentKit?

### Built for Chrome Extensions

Unlike traditional browser automation tools (Puppeteer, Playwright, Selenium), Browser AgentKit is specifically designed for **Chrome extension development**:

| Feature | Browser AgentKit | Puppeteer/Playwright |
|---------|------------------|---------------------|
| **Runtime** | Inside Chrome extension | External Node.js process |
| **Browser Instance** | Uses user's existing browser | Launches separate browser |
| **User Session** | Access to logged-in sessions & cookies | Isolated browser context |
| **Installation** | npm package only | Requires browser binary download |
| **Use Case** | Extension-based automation | Testing & scraping servers |

### CDP: The Foundation of Reliability

Browser AgentKit leverages the **Chrome DevTools Protocol (CDP)** directly, the same protocol that powers Chrome DevTools, Puppeteer, and Playwright internally:

- **Fine-grained Control** - Direct access to browser internals: DOM, network, input, runtime
- **No Script Injection** - Input simulation happens at the browser level, not via JavaScript injection
- **Deterministic Operations** - CDP commands are executed synchronously by the browser engine
- **Anti-Detection Friendly** - Native browser events are indistinguishable from real user actions
- **Full Debugging Capabilities** - Access to the same powerful APIs used by Chrome DevTools

### When to Use Browser AgentKit

✅ **Use Browser AgentKit when you need:**
- Build Chrome extensions with automation capabilities
- Access user's authenticated sessions (no re-login required)
- Operate within user's existing browser environment
- Lightweight SDK without bundled browser binaries

❌ **Use Puppeteer/Playwright instead when you need:**
- Server-side web scraping or testing
- Headless browser automation in CI/CD pipelines
- Cross-browser testing (Firefox, Safari, etc.)
- Isolated browser contexts for parallel execution

## Installation

```bash
npm install browser-agentkit
```

## Quick Start

```typescript
import { browser, Page } from 'browser-agentkit';

// Open a new tab
const tab = await browser.openTab('https://example.com');

// Create a page instance
const page = new Page(tab.id);
await page.initialize();

// Interact with the page
await page.fill('#search', 'browser automation');
await page.click('#submit');

// Extract content
const extractor = page.getContentExtractor();
const html = await extractor.getHTML();
const metadata = await extractor.getMetadata();

console.log('Page title:', metadata.title);

// Clean up
await page.close();
await browser.closeTab(tab.id);
```

## Core Modules

### Browser Module

Manage browser tabs and windows:

```typescript
import { browser } from 'browser-agentkit';

// Open and manage tabs
const tab = await browser.openTab('https://example.com');
const currentTab = await browser.getCurrentTab();
const allTabs = await browser.queryTabs({ currentWindow: true });

// Navigation
await browser.navigate(tab.id, 'https://google.com');
await browser.goBack(tab.id);
await browser.reload(tab.id);

// Screenshots
const screenshot = await browser.captureVisibleTab(tab.id);
```

### Page Module

Interact with web pages:

```typescript
import { Page, ScrollDirection } from 'browser-agentkit';

const page = new Page(tabId);
await page.initialize();

// Click elements
await page.click('#button');

// Fill forms
await page.fill('#email', 'user@example.com');
await page.fill('#password', 'secret');

// Scroll
await page.scroll(ScrollDirection.DOWN);

// Wait for elements
await page.waitForSelector('#result');

// Advanced interactions
const keyboard = await page.getKeyboard();
await keyboard.press('Enter');

const mouse = await page.getMouse();
await mouse.click(100, 200);
```

### Content Extraction

Extract data from web pages:

```typescript
import { ContentExtractor } from 'browser-agentkit';

const extractor = new ContentExtractor(tabId);

// Get page content
const html = await extractor.getHTML();
const text = await extractor.getText();
const metadata = await extractor.getMetadata();

// Get element content
const result = await extractor.getElementContent('#article');
console.log(result.text);

// Check if PDF
const isPdf = await extractor.isPDF();
```

### Input Simulation

Simulate keyboard and mouse input:

```typescript
import { createKeyboard, createMouse } from 'browser-agentkit';

const keyboard = await createKeyboard({ tabId });

// Type text
await keyboard.type('Hello World');

// Press keys
await keyboard.press('Enter');
await keyboard.press('ControlOrMeta+KeyA'); // Ctrl/Cmd + A

// Mouse operations
const mouse = createMouse({ tabId }, keyboard);
await mouse.move(100, 200);
await mouse.click(100, 200);
await mouse.dblclick(150, 250);
```

### Event Management

Listen to browser events:

```typescript
import { events } from 'browser-agentkit';

// Tab events
events.onTabCreated((tab) => {
  console.log('New tab created:', tab.url);
});

events.onTabUpdated((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    console.log('Tab loaded:', tab.url);
  }
});

// Network events
events.onBeforeRequest((details) => {
  console.log('Request:', details.url);
});

events.onCompleted((details) => {
  console.log('Response:', details.url);
});
```

## Advanced Examples

### Form Automation

```typescript
import { browser, Page } from 'browser-agentkit';

async function fillLoginForm() {
  const tab = await browser.openTab('https://example.com/login');
  const page = new Page(tab.id);
  await page.initialize();

  await page.fill('#username', 'myuser');
  await page.fill('#password', 'mypass');
  await page.click('#login-button');

  await page.waitForNavigation();
  console.log('Login successful!');

  await page.close();
}
```

### Web Scraping

```typescript
import { browser, Page } from 'browser-agentkit';

async function scrapeData() {
  const tab = await browser.openTab('https://example.com/data');
  const page = new Page(tab.id);
  await page.initialize();

  const extractor = page.getContentExtractor();
  const metadata = await extractor.getMetadata();
  const content = await extractor.getElementContent('.data-container');

  const data = {
    title: metadata.title,
    description: metadata.description,
    content: content.text
  };

  await page.close();
  await browser.closeTab(tab.id);

  return data;
}
```

### Drag and Drop

```typescript
import { Page } from 'browser-agentkit';

async function dragAndDrop(tabId: number) {
  const page = new Page(tabId);
  await page.initialize();

  const mouse = await page.getMouse();

  // Drag from (100, 100) to (300, 300)
  await mouse.move(100, 100);
  await mouse.down();
  await mouse.move(300, 300, { steps: 10 }); // Smooth movement
  await mouse.up();

  await page.close();
}
```

## API Reference

### Classes

#### Browser

Main class for browser-level operations.

| Method | Description |
|--------|-------------|
| `openTab(url, options?)` | Opens a new tab |
| `getTab(tabId)` | Gets tab information |
| `getCurrentTab(windowId?)` | Gets the active tab |
| `queryTabs(queryInfo)` | Queries tabs |
| `searchHistory(query)` | Searches browser history |
| `closeTab(tabId)` | Closes a tab |
| `navigate(tabId, url)` | Navigates to URL |
| `goBack(tabId)` | Goes back in history |
| `goForward(tabId)` | Goes forward in history |
| `reload(tabId, bypassCache?)` | Reloads a tab |
| `captureVisibleTab(tabId, options?)` | Captures visible area screenshot |
| `captureFullPage(tabId)` | Captures full page screenshot |
| `createHiddenTab(url)` | Creates a hidden tab for background processing |
| `captureVisibleTab(tabId, options?)` | Captures visible area |

#### Page

Main class for page-level operations.

| Method | Description |
|--------|-------------|
| `initialize()` | Initializes the page (must call before other methods) |
| `close()` | Cleans up resources |
| `click(selector)` | Clicks an element |
| `fill(selector, text)` | Fills an input field |
| `scroll(direction, amount?)` | Scrolls the page |
| `navigate(url)` | Navigates to URL |
| `waitForNavigation(options?)` | Waits for navigation to complete |
| `waitForSelector(selector, options?)` | Waits for element to appear |
| `element(selector)` | Creates PageElement instance |
| `getKeyboard()` | Gets Keyboard instance |
| `getMouse()` | Gets Mouse instance |
| `getContentExtractor()` | Gets ContentExtractor instance |
| `evaluate(fn, ...args)` | Executes script in page context |
| `captureVisible(tabId, options?)` | Captures using debugger API |

#### Actions

Standalone class for page actions (used internally by Page).

| Method | Description |
|--------|-------------|
| `click(selector)` | Clicks an element |
| `fill(selector, value)` | Fills an input field |
| `search(selector, value)` | Fills input and presses Enter |
| `scroll(direction, amount?)` | Scrolls the page |
| `waitForSelector(selector, options?)` | Waits for element to appear |

#### Navigation

Handles page navigation.

| Method | Description |
|--------|-------------|
| `navigate(url)` | Navigates to URL |
| `waitForNavigation(options?)` | Waits for navigation to complete |
| `waitForCondition(fn, options?)` | Waits for a condition to be true |

#### PageElement

Represents a DOM element for interaction.

| Method | Description |
|--------|-------------|
| `waitForExist(options?)` | Waits for element to exist |
| `exists()` | Checks if element exists |
| `getBoundingBox()` | Gets element's bounding box |
| `getText()` | Gets element's text content |
| `getAttributeValue(name)` | Gets attribute value |
| `scrollIntoView()` | Scrolls element into view |
| `findElement()` | Finds element and returns node IDs |

#### ContentExtractor

Extracts content from web pages.

| Method | Description |
|--------|-------------|
| `getPageSnapshot(options?)` | Gets page snapshot with HTML and metadata |
| `getHTML(options?)` | Gets HTML content (options: `{ viewportOnly?: boolean }`) |
| `getText()` | Gets plain text content |
| `getMetadata()` | Gets page metadata (title, description, etc.) |
| `getElementContent(selector)` | Gets element's HTML and text content |
| `isPDF()` | Checks if current page is a PDF |

#### Keyboard

Simulates keyboard input.

| Method | Description |
|--------|-------------|
| `down(key)` | Presses a key down |
| `up(key)` | Releases a key |
| `press(key, options?)` | Presses and releases a key |
| `type(text, options?)` | Types a sequence of characters |
| `insertText(text)` | Inserts text directly |

#### Mouse

Simulates mouse input.

| Method | Description |
|--------|-------------|
| `move(x, y, options?)` | Moves mouse to position |
| `down(options?)` | Presses mouse button down |
| `up(options?)` | Releases mouse button |
| `click(x, y, options?)` | Clicks at position |
| `dblclick(x, y, options?)` | Double-clicks at position |
| `wheel(deltaX, deltaY)` | Scrolls using mouse wheel |

#### EventManager

Manages browser event listeners.

| Method | Description |
|--------|-------------|
| `on(eventName, callback)` | Registers custom event listener |
| `off(eventName, callback)` | Removes custom event listener |
| `emit(eventName, ...args)` | Emits custom event |
| `onTabCreated(callback)` | Listens for tab created events |
| `onTabRemoved(callback)` | Listens for tab removed events |
| `onTabUpdated(callback)` | Listens for tab updated events |
| `onTabActivated(callback)` | Listens for tab activated events |
| `onBeforeRequest(callback, filter?)` | Listens for network requests |
| `onCompleted(callback, filter?)` | Listens for completed requests |
| `cleanup()` | Removes all listeners |

#### TabManager

Low-level tab management (used internally by Browser).

| Method | Description |
|--------|-------------|
| `create(url, options?)` | Creates a new tab |
| `get(tabId)` | Gets tab by ID |
| `getActive(windowId?)` | Gets active tab |
| `query(queryInfo)` | Queries tabs |
| `close(tabId)` | Closes a tab |
| `update(tabId, properties)` | Updates tab properties |
| `navigate(tabId, url)` | Navigates to URL |
| `goBack(tabId)` | Goes back in history |
| `goForward(tabId)` | Goes forward in history |
| `reload(tabId, bypassCache?)` | Reloads tab |
| `createHidden(url)` | Creates hidden tab |


### Enums

#### ScrollDirection

```typescript
enum ScrollDirection {
  UP = 'UP',
  DOWN = 'DOWN',
}
```

### Types

```typescript
// Tab information
type TabInfo = chrome.tabs.Tab

// Tab context for operations
interface TabContext {
  tabId: number
  mainTabId?: number
  url?: string
  title?: string
}

// Page content snapshot
interface PageContent {
  html: string
  markdown?: string
  meta?: PageMetadata
  isPdf?: boolean
  resources?: unknown[]
}

// Page metadata
interface PageMetadata {
  title?: string
  description?: string
  url?: string
  image?: string
  [key: string]: string | undefined
}

// Screenshot options
interface ScreenshotOptions {
  format?: 'png' | 'jpeg'
  quality?: number  // 0-100, jpeg only
}

// Element bounding box
interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

// Viewport information
interface ViewportInfo {
  width: number
  height: number
  x: number
  y: number
}
```

### Factory Functions

| Function | Description |
|----------|-------------|
| `createKeyboard(debuggee)` | Creates Keyboard instance with platform detection |
| `createMouse(tabContext, keyboard)` | Creates Mouse instance |

### Default Instances

```typescript
import { browser, events } from 'browser-agentkit';

// Pre-initialized Browser instance
browser.openTab('https://example.com');

// Pre-initialized EventManager instance
events.onTabCreated((tab) => console.log(tab));
```

## Requirements

- Chrome/Chromium browser
- Chrome extension with appropriate permissions:
  - `tabs`
  - `debugger`
  - `scripting`
  - `activeTab`
  - `history`

## License

MIT
