/**
 * 课程 API
 */

import type { BiliClient } from '../../transport'
import type { BiliApiResponse } from '../../types'

/** 获取课程元数据 */
export async function getCheeseMeta(
  client: BiliClient,
  params: { seasonId?: number; epId?: number },
): Promise<BiliApiResponse> {
  const query: Record<string, string> = {}
  if (params.seasonId) query.season_id = String(params.seasonId)
  if (params.epId) query.ep_id = String(params.epId)
  return client.get('/pugv/view/web/season', query)
}

/** 获取课程视频列表 */
export async function getCheeseList(
  client: BiliClient,
  seasonId: number,
  page?: number,
  pageSize?: number,
): Promise<BiliApiResponse> {
  return client.get('/pugv/view/web/ep/list', {
    season_id: String(seasonId),
    pn: String(page ?? 1),
    ps: String(pageSize ?? 50),
  })
}

/** 获取课程播放地址 */
export async function getCheesePlayUrl(
  client: BiliClient,
  params: { aid: number; cid: number; epId: number },
): Promise<BiliApiResponse> {
  return client.get('/pugv/player/web/playurl', {
    avid: String(params.aid),
    cid: String(params.cid),
    ep_id: String(params.epId),
    qn: '127',
    fnval: '4048',
    fourk: '1',
  })
}
