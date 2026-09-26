/**
 * Bilibili API 签名算法
 *
 * 包含三种签名机制：
 * - APP 签名（appsign）：用于 APP 端 API 的 MD5 签名
 * - WBI 签名：用于 Web 端部分接口的风控签名
 * - bili_ticket：用于 Web 端 ticket 获取的 HMAC-SHA256 签名
 */

import { createHash, createHmac } from 'crypto'

// 已知的 AppKey / AppSec 映射表

/** 已知的 appkey -> appsec 映射 */
export const APP_KEY_MAP: Record<string, string> = {
  // Android 客户端 (bili-hardcore 使用)
  '783bbb7264451d82': '2653583c8873dea268ab9386918b1d65',
  // Android 客户端 (通用)
  '1d8b6e7d45233436': '560c52ccd288fed045859ed18bffd973',
  // iOS 客户端
  '27eb53fc9058f8c3': 'c2ed53a74eeefe6cf99fda01e1d96e7f',
  // TV 端
  '4409e2ce8ffd6b70': '59b43e04ad6965f34319062b478f83dd',
}

// 工具函数

/** MD5 哈希（hex 小写） */
export function md5(input: string): string {
  return createHash('md5').update(input).digest('hex')
}

/** HMAC-SHA256 哈希（hex 小写） */
export function hmacSha256(key: string, message: string): string {
  return createHmac('sha256', key).update(message).digest('hex')
}

// APP 签名

/**
 * APP API 签名算法
 *
 * 1. 为参数添加 ts（时间戳）+ appkey
 * 2. 按 key 排序
 * 3. urlencode 拼接
 * 4. MD5(query + appsec) 生成 sign
 *
 * @param params - 原始参数（会被原地修改，添加 ts/appkey/sign）
 * @param appkey - AppKey
 * @param appsec - AppSec（盐值）
 */
export function appsign(params: Record<string, string>, appkey: string, appsec: string): void {
  const ts = Math.floor(Date.now() / 1000).toString()
  params.ts = ts
  params.appkey = appkey

  // 按 key 排序后 urlencode
  const sortedKeys = Object.keys(params).sort()
  const query = sortedKeys
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join('&')

  const sign = md5(query + appsec)
  params.sign = sign
}

// WBI 签名

/** WBI mixin_key 重排映射表 */
const MIXIN_KEY_ENC_TAB: number[] = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28,
  14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54,
  21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
]

/**
 * WBI 签名器
 *
 * 用法：
 * 1. 从 nav 接口或 bili_ticket 接口获取 img_key 和 sub_key
 * 2. 通过 init(imgKey, subKey) 初始化
 * 3. 调用 sign(params) 为参数追加 w_rid 和 wts
 */
export class WbiSigner {
  private _imgKey = ''
  private _subKey = ''
  private _mixinKey = ''

  /**
   * 从 nav 接口的 wbi_img 数据初始化
   * @param imgUrl - wbi_img.img_url 字段（取出文件名部分）
   * @param subUrl - wbi_img.sub_url 字段（取出文件名部分）
   */
  static fromNav(imgUrl: string, subUrl: string): WbiSigner {
    const extractKey = (url: string): string => {
      // 从 URL 中提取文件名（去掉扩展名）
      const parts = url.split('/')
      const filename = parts[parts.length - 1] ?? ''
      return filename.replace(/\.[^.]+$/, '')
    }
    const signer = new WbiSigner()
    signer.init(extractKey(imgUrl), extractKey(subUrl))
    return signer
  }

  /**
   * 直接使用 img_key 和 sub_key 初始化
   */
  init(imgKey: string, subKey: string): void {
    this._imgKey = imgKey
    this._subKey = subKey
    const rawKey = imgKey + subKey
    // 按 MIXIN_KEY_ENC_TAB 重排，取前 32 位
    this._mixinKey = MIXIN_KEY_ENC_TAB.map((i) => rawKey[i])
      .join('')
      .slice(0, 32)
  }

  /** 是否已初始化 */
  get ready(): boolean {
    return this._mixinKey.length === 32
  }

  /**
   * 对参数进行 WBI 签名（原地修改，添加 w_rid 和 wts）
   */
  sign(params: Record<string, string>): void {
    const wts = Math.floor(Date.now() / 1000).toString()
    params.wts = wts

    // 按 key 排序，拼接 query string
    const sortedKeys = Object.keys(params).sort()
    const query = sortedKeys
      .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
      .join('&')

    const wRid = md5(query + this._mixinKey)
    params.w_rid = wRid
  }
}

// bili_ticket

/**
 * 生成 bili_ticket 签名参数
 * 用于请求 /bapis/bilibili.api.ticket.v1.Ticket/GenWebTicket
 */
export function genTicketParams(csrf = ''): Record<string, string> {
  const ts = Math.floor(Date.now() / 1000).toString()
  const hexsign = hmacSha256('XgwSnGZ1p', `ts${ts}`)
  return {
    key_id: 'ec02',
    hexsign,
    'context[ts]': ts,
    csrf,
  }
}
