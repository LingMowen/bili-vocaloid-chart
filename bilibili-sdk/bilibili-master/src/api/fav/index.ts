/**
 * 收藏夹 API
 */

import type { BiliClient } from '../../transport'
import type { BiliApiResponse } from '../../types'

/** 获取收藏夹列表 */
export async function getFavList(
  client: BiliClient,
  mid: number,
  type?: number,
  rid?: number,
): Promise<BiliApiResponse> {
  const params: Record<string, string> = {
    up_mid: String(mid),
    web_location: '333.1387',
  }
  if (type !== undefined) params.type = String(type)
  if (rid !== undefined) params.rid = String(rid)
  return client.get('/x/v3/fav/folder/created/list-all', params, 'cookie')
}

/** 获取收藏夹信息 */
export async function getFavInfo(client: BiliClient, mediaId: number): Promise<BiliApiResponse> {
  return client.get('/x/v3/fav/folder/info', { media_id: String(mediaId) })
}

/** 获取收藏夹内容 */
export async function getFavContent(
  client: BiliClient,
  params: {
    mediaId: number
    page?: number
    ps?: number
    keyword?: string
    order?: string
    tid?: number
  },
): Promise<BiliApiResponse> {
  return client.get('/x/v3/fav/resource/list', {
    media_id: String(params.mediaId),
    pn: String(params.page ?? 1),
    ps: String(params.ps ?? 20),
    keyword: params.keyword ?? '',
    order: params.order ?? 'mtime',
    type: '0',
    tid: String(params.tid ?? 0),
    platform: 'web',
    web_location: '333.1387',
  })
}

/** 收藏视频 */
export async function addFavVideo(
  client: BiliClient,
  rid: number,
  addMediaIds: number[],
  delMediaIds: number[] = [],
): Promise<BiliApiResponse> {
  return client.post(
    '/x/v3/fav/resource/deal',
    {
      rid: String(rid),
      type: '2',
      add_media_ids: addMediaIds.join(','),
      del_media_ids: delMediaIds.join(','),
    },
    'cookie',
  )
}
