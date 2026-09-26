/**
 * 视频操作 API（动作类）
 */

import type { BiliClient } from '../../transport'
import type { BiliApiResponse } from '../../types'

import type { VideoIdParam } from './info.js'

/** 点赞/取消点赞 */
export async function likeVideo(
  client: BiliClient,
  params: VideoIdParam & { like: boolean },
): Promise<BiliApiResponse> {
  return client.post(
    '/x/web-interface/archive/like',
    {
      aid: params.aid ? String(params.aid) : '',
      bvid: params.bvid ?? '',
      like: params.like ? '1' : '2',
    },
    'cookie',
  )
}

/** 投币 */
export async function coinVideo(
  client: BiliClient,
  params: VideoIdParam & { count?: number; alsoLike?: boolean },
): Promise<BiliApiResponse> {
  return client.post(
    '/x/web-interface/coin/add',
    {
      aid: params.aid ? String(params.aid) : '',
      bvid: params.bvid ?? '',
      multiply: String(params.count ?? 1),
      select_like: params.alsoLike ? '1' : '0',
    },
    'cookie',
  )
}

/** 一键三连 */
export async function tripleVideo(
  client: BiliClient,
  params: VideoIdParam,
): Promise<BiliApiResponse> {
  return client.post(
    '/x/web-interface/archive/like/triple',
    {
      aid: params.aid ? String(params.aid) : '',
      bvid: params.bvid ?? '',
    },
    'cookie',
  )
}
