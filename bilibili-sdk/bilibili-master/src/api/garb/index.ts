/**
 * 装扮 API
 */

import type { BiliClient } from '../../transport'
import type { BiliApiResponse } from '../../types'

/** 搜索装扮/收藏集 */
export async function searchGarb(
  client: BiliClient,
  keyword: string,
  page?: number,
  pageSize?: number,
): Promise<BiliApiResponse> {
  return client.get('/x/garb/v2/mall/home/search', {
    key_word: keyword,
    pn: String(page ?? 1),
    ps: String(pageSize ?? 20),
  })
}

/** 获取装扮列表 */
export async function getGarbList(
  client: BiliClient,
  params: {
    groupId?: number
    partId?: number
    sortType?: number
    page?: number
    pageSize?: number
  } = {},
): Promise<BiliApiResponse> {
  return client.get('/x/garb/v2/mall/partition/item/list', {
    group_id: String(params.groupId ?? 0),
    part_id: String(params.partId ?? 6),
    sort_type: String(params.sortType ?? 0),
    pn: String(params.page ?? 1),
    ps: String(params.pageSize ?? 20),
  })
}

/** 获取收藏集基本信息 */
export async function getDlcBasic(client: BiliClient, actId: number): Promise<BiliApiResponse> {
  return client.get('/x/vas/dlc_act/act/basic', {
    act_id: String(actId),
  })
}

/** 获取装扮详情 */
export async function getGarbDetail(client: BiliClient, itemId: number): Promise<BiliApiResponse> {
  return client.get('/x/garb/v2/mall/suit/detail', {
    item_id: String(itemId),
  })
}
