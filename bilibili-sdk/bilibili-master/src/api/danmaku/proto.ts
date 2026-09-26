/**
 * 弹幕 protobuf 解析
 *
 * B 站分段弹幕接口（/x/v2/dm/wbi/web/seg.so 等）返回 gzip 压缩的 protobuf 二进制，
 * 使用 protobufjs 动态解析 .proto 定义得到结构化弹幕数组。
 */

import { gunzipSync } from 'node:zlib'

import protobuf from 'protobufjs'

import { BiliApiError } from '../../core'
import type { BiliApiResponse } from '../../types'

/** 弹幕条目 */
export interface DanmakuElem {
  /** 弹幕 dmid */
  id: number
  /** 视频内出现时间（毫秒） */
  progress: number
  /** 弹幕模式：1/2/3 滚动，4 底部，5 顶部，6 逆向，7 高级，8 代码弹幕 */
  mode: number
  /** 字号：18 小，25 标准，36 大 */
  fontsize: number
  /** 颜色（十进制 RGB888） */
  color: number
  /** 发送者 mid 的哈希（用于屏蔽用户） */
  midHash: string
  /** 弹幕内容（UTF-8） */
  content: string
  /** 发送时间戳（秒） */
  ctime: number
  /** 权重 [0-10]，用于智能屏蔽 */
  weight: number
  /** 动作 */
  action: string
  /** 弹幕池：0 普通，1 字幕，2 特殊（代码/BAS） */
  pool: number
  /** 弹幕 dmid 的字串形式 */
  idStr: string
  /** 弹幕属性位 */
  attr: number
  /** 动画 */
  animation: string
}

// 权威弹幕 protobuf 定义（bilibili-API-collect）
const PROTO_SOURCE = `
syntax = "proto3";

message DanmakuElem {
  int64 id = 1;
  int32 progress = 2;
  int32 mode = 3;
  int32 fontsize = 4;
  uint32 color = 5;
  string midHash = 6;
  string content = 7;
  int64 ctime = 8;
  int32 weight = 9;
  string action = 10;
  int32 pool = 11;
  string idStr = 12;
  int32 attr = 13;
  string animation = 14;
}

message DmSegMobileReply {
  repeated DanmakuElem elems = 1;
}
`

// 模块级缓存解析结果
const root = protobuf.parse(PROTO_SOURCE).root
const dmSegMobileReply = root.lookupType('DmSegMobileReply')

/** 解压 gzip 字节（seg.so 响应可能被 gzip 压缩） */
function maybeDecompress(buffer: Uint8Array): Uint8Array {
  // gzip 魔数 0x1f 0x8b
  if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
    return gunzipSync(buffer)
  }
  return buffer
}

/**
 * 解析弹幕分段二进制为弹幕数组
 */
export function decodeDanmaku(buffer: ArrayBuffer | Uint8Array): DanmakuElem[] {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  const decoded = maybeDecompress(bytes)
  // 未登录等场景下接口可能返回 JSON 错误响应而非 protobuf
  if (decoded.length > 0 && decoded[0] === 0x7b /* { */) {
    const body = JSON.parse(new TextDecoder().decode(decoded)) as BiliApiResponse
    throw new BiliApiError(body.code, body.message, body)
  }
  const message = dmSegMobileReply.decode(decoded)
  const object = dmSegMobileReply.toObject(message, {
    longs: Number,
    enums: Number,
    defaults: true,
  })
  return (object.elems as DanmakuElem[] | undefined) ?? []
}
