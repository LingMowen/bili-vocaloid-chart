/**
 * 创作中心 API
 */

import type { BiliClient } from '../../transport'
import type { BiliApiResponse } from '../../types'

/** 获取对比数据 */
export async function getCreativeCompare(client: BiliClient): Promise<BiliApiResponse> {
  return client.get('https://member.bilibili.com/x/web/data/v2/overview/compare', {}, 'cookie')
}

/** 获取统计图表数据 */
export async function getCreativeGraph(
  client: BiliClient,
  period: number,
  type: string,
): Promise<BiliApiResponse> {
  return client.get(
    'https://member.bilibili.com/x/web/data/v2/overview/stat/graph',
    {
      period: String(period),
      s_locale: 'zh_CN',
      type,
    },
    'cookie',
  )
}

/** 获取统计数据 */
export async function getCreativeNum(client: BiliClient, period: number): Promise<BiliApiResponse> {
  return client.get(
    'https://member.bilibili.com/x/web/data/v2/overview/stat/num',
    {
      period: String(period),
      s_locale: 'zh_CN',
    },
    'cookie',
  )
}

/** 获取粉丝数据 */
export async function getCreativeFanOverview(
  client: BiliClient,
  period: number,
): Promise<BiliApiResponse> {
  return client.get(
    'https://member.bilibili.com/x/web/data/v2/fans/stat/num',
    {
      period: String(period),
    },
    'cookie',
  )
}
