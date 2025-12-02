/**
 * @fileoverview Timeout utilities for async operations
 */

import { TimeoutError } from '@/types'

/**
 * Wraps an async function with a timeout
 */
export function withTimeout<T>(timeoutMs: number) {
  return function (fn: (...args: unknown[]) => Promise<T>) {
    return async (...args: unknown[]): Promise<T> => {
      return new Promise<T>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new TimeoutError(`Operation timed out after ${timeoutMs}ms`))
        }, timeoutMs)

        fn(...args)
          .then((result) => {
            clearTimeout(timeoutId)
            resolve(result)
          })
          .catch((error) => {
            clearTimeout(timeoutId)
            reject(error)
          })
      })
    }
  }
}

/**
 * Waits for a condition to be true
 */
export async function waitForCondition(
  fn: () => boolean | Promise<boolean>,
  options: {
    timeout?: number
    interval?: number
    errorMessage?: string
  } = {}
): Promise<void> {
  const { timeout = 30000, interval = 100, errorMessage = 'Condition not met' } = options
  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    const result = await fn()
    if (result) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, interval))
  }

  throw new TimeoutError(errorMessage)
}

/**
 * Retry an operation with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number
    delay?: number
    backoff?: number
    shouldRetry?: (error: Error) => boolean
  } = {}
): Promise<T> {
  const { maxAttempts = 3, delay = 300, backoff = 1.5, shouldRetry = () => true } = options

  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error
      if (attempt >= maxAttempts || !shouldRetry(lastError)) {
        break
      }
      await new Promise((r) => setTimeout(r, delay * Math.pow(backoff, attempt - 1)))
    }
  }

  throw lastError
}
