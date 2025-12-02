/**
 * @fileoverview Navigation handling
 */

import { TabContext, Debuggee } from '@/types'
import { waitForCondition } from '@/utils'

/**
 * Creates a network idle waiter
 */
export function createNetworkIdleWaiter(
  tabContext: TabContext,
  config: {
    action?: string
    waitForFCP?: boolean
    maxWaitingTimeoutMs?: number
  } = {}
) {
  const { tabId } = tabContext
  const { waitForFCP = true, maxWaitingTimeoutMs = 10000 } = config

  let isNetworkIdle = false
  let hasFCP = !waitForFCP
  let networkIdleTimeout: number
  const inflightRequests = new Set<string>()
  let waitPromiseResolve: (() => void) | null = null
  const abortController = new AbortController()

  // Reset the state
  const reset = () => {
    isNetworkIdle = false
    hasFCP = !waitForFCP
    networkIdleTimeout && clearTimeout(networkIdleTimeout)
    inflightRequests.clear()
  }

  // Check if we can consider navigation complete
  const checkCompletion = () => {
    if (
      waitPromiseResolve &&
      hasFCP &&
      isNetworkIdle &&
      inflightRequests.size === 0 &&
      !abortController.signal.aborted
    ) {
      waitPromiseResolve()
      waitPromiseResolve = null
    }
  }

  // Track request events
  const addRequestListener = () => {
    const onRequestSent = (debuggee: Debuggee, message: string, params: any) => {
      if (
        debuggee.tabId === tabId &&
        message === 'Network.requestWillBeSent' &&
        !abortController.signal.aborted
      ) {
        inflightRequests.add(params.requestId)
        isNetworkIdle = false
        networkIdleTimeout && clearTimeout(networkIdleTimeout)
      }
    }

    const onRequestFinished = (debuggee: Debuggee, message: string, params: any) => {
      if (
        debuggee.tabId === tabId &&
        (message === 'Network.loadingFinished' || message === 'Network.loadingFailed') &&
        !abortController.signal.aborted
      ) {
        inflightRequests.delete(params.requestId)

        if (inflightRequests.size === 0) {
          // @ts-expect-error 预期类型错误，无须校验
          networkIdleTimeout = setTimeout(() => {
            isNetworkIdle = true
            checkCompletion()
          }, 500)
        }
      }
    }

    const onFirstContentfulPaint = (debuggee: Debuggee, message: string, params: any) => {
      if (
        debuggee.tabId === tabId &&
        message === 'Page.lifecycleEvent' &&
        params.name === 'firstContentfulPaint' &&
        !abortController.signal.aborted
      ) {
        hasFCP = true
        checkCompletion()
      }
    }

    chrome.debugger.onEvent.addListener(onRequestSent)
    chrome.debugger.onEvent.addListener(onRequestFinished)
    chrome.debugger.onEvent.addListener(onFirstContentfulPaint)

    return () => {
      chrome.debugger.onEvent.removeListener(onRequestSent)
      chrome.debugger.onEvent.removeListener(onRequestFinished)
      chrome.debugger.onEvent.removeListener(onFirstContentfulPaint)
    }
  }

  const wait = async () => {
    reset()
    const removeListeners = addRequestListener()

    try {
      await Promise.race([
        new Promise<void>((resolve) => {
          waitPromiseResolve = resolve
          checkCompletion()
        }),
        new Promise<void>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Navigation timeout after ${maxWaitingTimeoutMs}ms`))
          }, maxWaitingTimeoutMs)
        }),
        // Abort signal
        new Promise<void>((_, reject) => {
          abortController.signal.addEventListener('abort', () => {
            reject(new Error('Navigation aborted'))
          })
        }),
      ])
    } finally {
      removeListeners()
      reset()
    }
  }

  const abort = () => {
    abortController.abort()
  }

  return { wait, abort }
}

/**
 * Navigates to a URL
 */
export async function navigate(tabContext: TabContext, url: string): Promise<void> {
  const { tabId } = tabContext
  const networkIdleWaiter = createNetworkIdleWaiter(tabContext, {
    action: 'NAVIGATE',
    waitForFCP: true,
    maxWaitingTimeoutMs: 10000,
  })

  try {
    await chrome.debugger.sendCommand({ tabId }, 'Page.navigate', { url })
    await networkIdleWaiter.wait()
  } catch (error) {
    networkIdleWaiter.abort()
    throw error
  }
}

/**
 * Navigation class
 */
export class Navigation {
  constructor(private tabId: number) {}

  /**
   * Navigates to a URL
   */
  async navigate(url: string): Promise<void> {
    const tabContext: TabContext = { tabId: this.tabId }
    return navigate(tabContext, url)
  }

  /**
   * Waits for navigation to complete
   */
  async waitForNavigation(options: { timeout?: number } = {}): Promise<void> {
    const { timeout = 30000 } = options
    const tabContext: TabContext = { tabId: this.tabId }

    const networkIdleWaiter = createNetworkIdleWaiter(tabContext, {
      action: 'WAIT_FOR_NAVIGATION',
      waitForFCP: true,
      maxWaitingTimeoutMs: timeout,
    })

    try {
      await networkIdleWaiter.wait()
    } catch (error) {
      networkIdleWaiter.abort()
      throw error
    }
  }

  /**
   * Waits for the current page to meet a condition
   */
  async waitForCondition(
    conditionFn: () => boolean | Promise<boolean>,
    options: { timeout?: number; interval?: number; errorMessage?: string } = {}
  ): Promise<void> {
    await waitForCondition(conditionFn, options)
  }
}
