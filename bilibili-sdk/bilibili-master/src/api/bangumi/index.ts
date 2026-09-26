/**
 * 番剧 API
 */

import type { BiliClient } from '../../transport'
import type { BiliApiResponse } from '../../types'

// API 函数

/** 获取番剧信息 */
export async function getBangumiInfo(
  client: BiliClient,
  params: { seasonId?: number; epId?: number },
): Promise<BiliApiResponse> {
  const query: Record<string, string> = {}
  if (params.seasonId) query.season_id = String(params.seasonId)
  if (params.epId) query.ep_id = String(params.epId)
  return client.get('/pgc/view/web/season', query, 'cookie')
}

/** 获取番剧时间表 */
export async function getBangumiTimeline(client: BiliClient): Promise<BiliApiResponse> {
  return client.get('/pgc/web/timeline', {}, 'none')
}

/** 获取番剧分集索引 */
export async function getBangumiSeasonIndex(
  client: BiliClient,
  params: { seasonId: number },
): Promise<BiliApiResponse> {
  return client.get('/pgc/view/web/season/section', { season_id: String(params.seasonId) }, 'none')
}

/** 获取番剧推荐 */
export async function getBangumiRecommend(client: BiliClient): Promise<BiliApiResponse> {
  return client.get('/pgc/web/related/recommend', {}, 'none')
}
