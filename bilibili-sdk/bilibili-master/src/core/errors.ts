/**
 * Bilibili API 错误
 * 当 API 返回 code !== 0 时抛出
 */
export class BiliApiError extends Error {
  /** API 返回的错误码 */
  code: number
  /** 原始响应体（调试用） */
  rawResponse: unknown

  constructor(code: number, apiMessage: string, rawResponse?: unknown) {
    super(`[BiliApi ${String(code)}] ${apiMessage}`)
    this.name = 'BiliApiError'
    this.code = code
    this.rawResponse = rawResponse
  }
}
