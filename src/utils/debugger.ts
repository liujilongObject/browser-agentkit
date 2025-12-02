/**
 * @fileoverview Chrome Debugger API utilities
 */

import { Debuggee } from '@/types'

/**
 * Attaches the debugger to a tab
 */
export async function attachDebugger(tabId: number): Promise<() => Promise<void>> {
  const debuggee: Debuggee = { tabId }

  try {
    await chrome.debugger.attach(debuggee, '1.3')
  } catch (error: Error | unknown) {
    throw error
  }

  // Enable required domains
  await Promise.all([
    chrome.debugger.sendCommand(debuggee, 'DOM.enable'),
    chrome.debugger.sendCommand(debuggee, 'Page.enable'),
    chrome.debugger.sendCommand(debuggee, 'Network.enable'),
    chrome.debugger.sendCommand(debuggee, 'DOMSnapshot.enable'),
    chrome.debugger.sendCommand(debuggee, 'Accessibility.enable'),
  ])

  // Return detach function
  return async () => {
    try {
      await chrome.debugger.detach(debuggee)
    } catch (error) {
      // Ignore errors during detach
      console.warn('Error detaching debugger:', error)
    }
  }
}

/**
 * Gets the active tab in the current window
 */
export async function getActiveTab(
  sender?: chrome.runtime.MessageSender
): Promise<chrome.tabs.Tab> {
  if (sender?.tab) {
    return sender.tab
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab) {
    throw new Error('No active tab found')
  }

  return tab
}

/**
 * Attaches the debugger to an iframe within a tab.
 * @param {string} frameId The ID of the iframe's frame.
、 * @returns {Promise<object>} The debuggee object for the iframe.
 */
export async function attachToIframe(frameId: string): Promise<Debuggee> {
  const target = (await chrome.debugger.getTargets()).find((t) => t.id === frameId)
  if (!target) {
    throw new Error('Target not found for frame ID: ' + frameId)
  }

  const debuggee = { targetId: target.id }

  try {
    await chrome.debugger.attach(debuggee, '1.3')
  } catch (error) {
    console.warn('Failed to attach debugger to iframe', {
      error: error instanceof Error ? error.message : error,
    })
  }

  try {
    // Required for parsing content
    await chrome.debugger.sendCommand(debuggee, 'Accessibility.enable')
  } catch (error) {
    console.warn('Failed to enable Accessibility or DOM for iframe', {
      error: error instanceof Error ? error.message : error,
    })
  }

  return debuggee
}
