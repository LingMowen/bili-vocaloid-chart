/**
 * 直播 API
 */

import type { BiliClient } from '../../transport'
import type { BiliApiResponse } from '../../types'

// 参数

export interface LiveRoomParam {
  roomId: number
}

export interface LiveAreaParam {
  parentId?: number
}

// API 函数

/** 获取直播间信息 */
export async function getLiveRoomInfo(
  client: BiliClient,
  params: LiveRoomParam,
): Promise<BiliApiResponse> {
  return client.get(
    'https://api.live.bilibili.com/xlive/web-room/v1/index/getInfoByRoom',
    { room_id: String(params.roomId) },
    'cookie',
  )
}

/** 获取直播流地址 */
export async function getLiveStreamUrl(
  client: BiliClient,
  params: LiveRoomParam & { qn?: number; platform?: string },
): Promise<BiliApiResponse> {
  return client.get(
    'https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo',
    {
      room_id: String(params.roomId),
      qn: String(params.qn ?? 10000),
      platform: params.platform ?? 'web',
    },
    'cookie',
  )
}

/** 获取直播分区列表 */
export async function getLiveAreaList(
  client: BiliClient,
  params: LiveAreaParam = {},
): Promise<BiliApiResponse> {
  const query: Record<string, string> = {}
  if (params.parentId) query.parent_id = String(params.parentId)
  return client.get('/xlive/web-interface/v1/index/getAreaList', query, 'none')
}
