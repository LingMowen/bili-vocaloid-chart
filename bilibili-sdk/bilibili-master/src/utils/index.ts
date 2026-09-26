/**
 * 工具函数
 *
 * 公共工具集，包括 AV/BV 号互转、图片 URL 格式化、哈希函数
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-misused-spread */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */

// 从核心模块重导出
export { hmacSha256, md5 } from '../core/sign.js'

// AV/BV 号互转
// 算法来源：https://www.zhihu.com/question/381784377/answer/1099438784

/** BV 号编码表（58 进制） */
const BV_DATA = [
  'F',
  'c',
  'w',
  'A',
  'P',
  'N',
  'K',
  'T',
  'M',
  'u',
  'g',
  '3',
  'G',
  'V',
  '5',
  'L',
  'j',
  '7',
  'E',
  'J',
  'n',
  'H',
  'p',
  'W',
  's',
  'x',
  '4',
  't',
  'b',
  '8',
  'h',
  'a',
  'Y',
  'e',
  'v',
  'i',
  'q',
  'B',
  'z',
  '6',
  'r',
  'k',
  'C',
  'y',
  '1',
  '2',
  'm',
  'U',
  'S',
  'D',
  'Q',
  'X',
  '9',
  'R',
  'd',
  'o',
  'Z',
  'f',
]

const BV_BASE = 58n
const BV_LEN = 12
const BV_XOR = 23442827791579n
const BV_MASK = 2251799813685247n
const BV_MAX_AID = 1n << 51n

/**
 * AV 号转 BV 号
 * @param aid - AV 号（数字）
 * @returns BV 号字符串（如 "BV17x411w7KC"）
 */
export function aid2bvid(aid: number): string {
  const bytes: string[] = Array.from({ length: BV_LEN }, (_, i) =>
    i < 3 ? ['B', 'V', '1'][i]! : '0',
  )
  let tmp = (BV_MAX_AID | BigInt(aid)) ^ BV_XOR
  let bvIdx = BV_LEN - 1
  while (tmp !== 0n && bvIdx >= 3) {
    bytes[bvIdx] = BV_DATA[Number(tmp % BV_BASE)]!
    tmp /= BV_BASE
    bvIdx--
  }
  // 交换位置 3↔9 和 4↔7
  ;[bytes[3], bytes[9]] = [bytes[9]!, bytes[3]!]
  ;[bytes[4], bytes[7]] = [bytes[7]!, bytes[4]!]
  return bytes.join('')
}

/**
 * BV 号转 AV 号
 * @param bvid - BV 号字符串（如 "BV17x411w7KC"）
 * @returns AV 号（数字）
 */
export function bvid2aid(bvid: string): number {
  const chars = [...bvid]
  // 交换位置 3↔9 和 4↔7
  ;[chars[3], chars[9]] = [chars[9]!, chars[3]!]
  ;[chars[4], chars[7]] = [chars[7]!, chars[4]!]
  // 取位置 3 到末尾
  const tail = chars.slice(3)
  let tmp = 0n
  for (const char of tail) {
    const idx = BV_DATA.indexOf(char)
    if (idx === -1) throw new Error(`无效的 BV 号字符: ${char}`)
    tmp = tmp * BV_BASE + BigInt(idx)
  }
  return Number((tmp & BV_MASK) ^ BV_XOR)
}

// 图片 URL 格式化

/**
 * 格式化 Bilibili 图片 URL（添加 @ 后缀以控制尺寸/格式）
 *
 * @param url - 原始图片 URL
 * @param width - 宽度（像素），可选
 * @param height - 高度（像素），可选
 * @param format - 图片格式，可选（如 "webp", "png", "jpg"）
 * @returns 格式化后的 URL
 *
 * @example
 * formatImageUrl('https://i0.hdslb.com/bfs/archive/xxx.jpg', 200, 200)
 * // => 'https://i0.hdslb.com/bfs/archive/xxx.jpg@200w_200h.webp'
 */
export function formatImageUrl(
  url: string,
  width?: number,
  height?: number,
  format?: string,
): string {
  const parts: string[] = []
  if (width) parts.push(`${String(width)}w`)
  if (height) parts.push(`${String(height)}h`)
  const suffix = parts.join('_')

  // 去掉原 URL 已有的 @ 后缀
  const atIdx = url.indexOf('@')
  const baseUrl = atIdx === -1 ? url : url.slice(0, atIdx)

  if (!suffix) {
    if (format === 'webp' && !url.includes('@')) {
      return `${baseUrl}@.webp`
    }
    return url
  }

  const fmt = format ?? 'webp'
  return `${baseUrl}@${suffix}.${fmt}`
}

// Cookie 解析

/**
 * 解析 cookie 字符串为键值对
 * "SESSDATA=xxx; bili_jct=yyy" => { SESSDATA: "xxx", bili_jct: "yyy" }
 */
export function parseCookie(cookieStr: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const part of cookieStr.split(';')) {
    const eqIdx = part.indexOf('=')
    if (eqIdx === -1) continue
    const key = part.slice(0, eqIdx).trim()
    const value = part.slice(eqIdx + 1).trim()
    if (key) result[key] = value
  }
  return result
}
