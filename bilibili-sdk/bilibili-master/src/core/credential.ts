/**
 * Credential（凭据）— 统一管理 Bilibili 认证信息
 *
 * 推荐使用「厚封装」模式：直接传入各字段
 * 也兼容「薄封装」模式：通过 Credential.fromCookie() 从 cookie 字符串解析
 */

import { parseCookie } from '../utils'

/** 厚封装构造参数 */
export interface CredentialFields {
  /** Cookie SESSDATA */
  sessdata?: string
  /** Cookie bili_jct（CSRF token） */
  biliJct?: string
  /** Cookie DedeUserID */
  dedeUserId?: string
  /** 设备 ID buvid3 */
  buvid3?: string
  /** 设备 ID buvid4 */
  buvid4?: string
  /** APP 登录 access_token */
  accessToken?: string
  /** APP 登录 refresh_token */
  refreshToken?: string
}

export class Credential {
  sessdata?: string
  biliJct?: string
  dedeUserId?: string
  buvid3?: string
  buvid4?: string
  accessToken?: string
  refreshToken?: string

  constructor(fields: CredentialFields = {}) {
    this.sessdata = fields.sessdata
    this.biliJct = fields.biliJct
    this.dedeUserId = fields.dedeUserId
    this.buvid3 = fields.buvid3
    this.buvid4 = fields.buvid4
    this.accessToken = fields.accessToken
    this.refreshToken = fields.refreshToken
  }

  /**
   * 「薄封装」工厂：从原始 cookie 字符串解析
   * 示例: "SESSDATA=xxx; bili_jct=yyy; DedeUserID=123"
   */
  static fromCookie(cookieStr: string): Credential {
    const parsed = parseCookie(cookieStr)
    return new Credential({
      sessdata: parsed.SESSDATA,
      biliJct: parsed.bili_jct,
      dedeUserId: parsed.DedeUserID,
      buvid3: parsed.buvid3,
      buvid4: parsed.buvid4,
    })
  }

  /**
   * 输出为 cookie 字符串（用于 HTTP Cookie header）
   */
  toCookieString(): string {
    const parts: string[] = []
    if (this.sessdata) parts.push(`SESSDATA=${this.sessdata}`)
    if (this.biliJct) parts.push(`bili_jct=${this.biliJct}`)
    if (this.dedeUserId) parts.push(`DedeUserID=${this.dedeUserId}`)
    if (this.buvid3) parts.push(`buvid3=${this.buvid3}`)
    if (this.buvid4) parts.push(`buvid4=${this.buvid4}`)
    return parts.join('; ')
  }

  /**
   * 输出为请求头键值对（用于 APP API 鉴权）
   */
  toHeaders(): Record<string, string> {
    const headers: Record<string, string> = {}
    if (this.accessToken) headers.access_key = this.accessToken
    if (this.biliJct) headers['x-csrf-token'] = this.biliJct
    if (this.dedeUserId) headers['x-bili-mid'] = this.dedeUserId
    if (this.buvid3) headers['x-bili-buvid3'] = this.buvid3
    if (this.buvid4) headers['x-bili-buvid4'] = this.buvid4
    return headers
  }

  /** 是否具有 Cookie 级别的登录凭据 */
  get hasCookie(): boolean {
    return !!(this.sessdata && this.biliJct && this.dedeUserId)
  }

  /** 是否具有 APP access_token */
  get hasAccessToken(): boolean {
    return !!this.accessToken
  }
}
