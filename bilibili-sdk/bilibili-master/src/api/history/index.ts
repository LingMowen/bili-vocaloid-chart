/**
 * 历史记录 API
 */

import type { BiliClient } from '../../transport'
import type { BiliApiResponse } from '../../types'

/** 获取观看历史 */
export async function getHistory(
  client: BiliClient,
  params: { page?: number; pageSize?: number; type?: string } = {},
): Promise<BiliApiResponse> {
  return client.get(
    '/x/web-interface/history/cursor',
    {
      pn: String(params.page ?? 1),
      ps: String(params.pageSize ?? 20),
      type: params.type ?? 'archive',
    },
    'cookie',
  )
}

/** 获取稍后再看列表 */
export async function getToViewList(client: BiliClient): Promise<BiliApiResponse> {
  return client.get('/x/v2/history/toview', {}, 'cookie')
}

/** 添加稍后再看 */
export async function addToView(client: BiliClient, aid: number): Promise<BiliApiResponse> {
  return client.post(
    '/x/v2/history/toview/add',
    {
      aid: String(aid),
    },
    'cookie',
  )
}

/** 删除稍后再看 */
export async function removeToView(client: BiliClient, aid: number): Promise<BiliApiResponse> {
  return client.post(
    '/x/v2/history/toview/del',
    {
      aid: String(aid),
      viewed: 'true',
    },
    'cookie',
  )
}
