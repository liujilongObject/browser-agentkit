/**
 * @fileoverview Utility functions export
 */

import { Debuggee } from '@/types'

export * from './timeout'
export * from './platform'
export * from './debugger'

/**
 * Helper to get modifiers bitmask
 */
export function getModifiersBitmask(modifiers: Set<string>): number {
  let mask = 0
  if (modifiers.has('Alt')) mask |= 1
  if (modifiers.has('Control')) mask |= 2
  if (modifiers.has('Meta')) mask |= 4
  if (modifiers.has('Shift')) mask |= 8
  return mask
}

/**
 * 在目标上下文，异步执行指定函数
 * @param {object} target - 目标上下文
 * @param {Function} execFunction - 要在目标上下文执行的异步回调函数
 * @param {Array<unknown>} [funcParams=[]] - 传给回调函数的入参数组，可选，默认空数组
 * @returns 执行函数后的返回值
 */
export async function evaluateFunctionInTarget<Args extends unknown[], R>(
  target: Debuggee,
  execFunction: (...args: Args) => R,
  funcParams?: Args
): Promise<Awaited<R>> {
  // 处理函数入参：有参数则把参数数组每项JSON序列化，拼接成函数调用的参数字符串
  // 目的：参数能安全传递到 CDP 的沙箱执行环境中，防止语法错误/注入问题
  const paramStr = funcParams
    ? funcParams.map((paramItem) => JSON.stringify(paramItem)).join(', ')
    : ''

  // 调用CDP协议的 Runtime.evaluate 方法，在目标上下文执行函数
  const evaluateResult = (await chrome.debugger.sendCommand(target, 'Runtime.evaluate', {
    expression: `(${execFunction.toString()})(${paramStr})`,
    returnByValue: true, // 直接返回结果值对象
    awaitPromise: true, // 强制等待异步函数执行完成
  })) as { exceptionDetails: any; result: { value: any } }

  if (evaluateResult?.exceptionDetails) {
    throw new Error(
      `Failed to evaluate function: ${JSON.stringify(evaluateResult.exceptionDetails)}`
    )
  }

  // 返回CDP执行函数后的最终返回值
  return evaluateResult?.result?.value
}
