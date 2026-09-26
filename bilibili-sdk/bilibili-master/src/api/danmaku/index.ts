/**
 * 弹幕 API
 */

import type { BiliClient } from '../../transport'
import type { BiliApiResponse } from '../../types'

import { decodeDanmaku, type DanmakuElem } from './proto.js'

/** 获取弹幕（分段，protobuf 解析） */
export async function getDanmaku(
  client: BiliClient,
  oid: number,
  segmentIndex: number,
  pid?: number,
): Promise<BiliApiResponse<DanmakuElem[]>> {
  const buffer = await client.getBinary(
    '/x/v2/dm/wbi/web/seg.so',
    {
      oid: String(oid),
      type: '1',
      segment_index: String(segmentIndex),
      pid: pid ? String(pid) : '',
    },
    'wbi',
  )
  return { code: 0, message: '0', ttl: 1, data: decodeDanmaku(buffer) }
}

/** 获取历史弹幕（protobuf 解析） */
export async function getHistoryDanmaku(
  client: BiliClient,
  oid: number,
  date: string,
): Promise<BiliApiResponse<DanmakuElem[]>> {
  const buffer = await client.getBinary(
    '/x/v2/dm/web/history/seg.so',
    {
      oid: String(oid),
      type: '1',
      date,
    },
    'cookie',
  )
  return { code: 0, message: '0', ttl: 1, data: decodeDanmaku(buffer) }
}

/** 获取弹幕配置 */
export async function getDanmakuView(
  client: BiliClient,
  oid: number,
  pid?: number,
): Promise<BiliApiResponse> {
  return client.get('/x/v2/dm/web/view', {
    type: '1',
    oid: String(oid),
    pid: pid ? String(pid) : '',
  })
}

/** 获取弹幕快照 */
export async function getDanmakuSnapshot(
  client: BiliClient,
  aid: number,
): Promise<BiliApiResponse> {
  return client.get('/x/v2/dm/ajax', { aid: String(aid) })
}

/** 发送弹幕 */
export async function sendDanmaku(
  client: BiliClient,
  params: {
    oid: number
    bvid: string
    msg: string
    progress: number
    color?: number
    mode?: number
    fontSize?: number
    pool?: number
  },
): Promise<BiliApiResponse> {
  return client.post(
    '/x/v2/dm/post',
    {
      type: '1',
      oid: String(params.oid),
      bvid: params.bvid,
      msg: params.msg,
      progress: String(params.progress),
      color: String(params.color ?? 16777215),
      fontsize: String(params.fontSize ?? 25),
      pool: String(params.pool ?? 0),
      mode: String(params.mode ?? 1),
      plat: '1',
    },
    'cookie',
  )
}

/** 点赞弹幕 */
export async function likeDanmaku(
  client: BiliClient,
  dmid: number,
  oid: number,
  unlike = false,
): Promise<BiliApiResponse> {
  return client.post(
    '/x/v2/dm/thumbup/add',
    {
      dmid: String(dmid),
      oid: String(oid),
      op: unlike ? '2' : '1',
      platform: 'web_player',
    },
    'cookie',
  )
}

export * from './proto.js'
