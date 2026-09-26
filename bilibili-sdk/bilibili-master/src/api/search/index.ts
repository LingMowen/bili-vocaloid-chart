/**
 * 搜索 API
 */

import type { BiliClient } from '../../transport'
import type { BiliApiResponse } from '../../types'

// 参数

export interface SearchParams {
  keyword: string
  page?: number
  pageSize?: number
  order?: string
  type?: number
  duration?: number
  tids?: number
}

export interface SuggestParams {
  term: string
}

// API 函数

/** 搜索 */
export async function search(client: BiliClient, params: SearchParams): Promise<BiliApiResponse> {
  const query: Record<string, string> = {
    keyword: params.keyword,
    page: String(params.page ?? 1),
    pagesize: String(params.pageSize ?? 20),
  }
  if (params.order) query.order = params.order
  if (params.type !== undefined) query.search_type = String(params.type)
  if (params.duration !== undefined) query.duration = String(params.duration)
  if (params.tids !== undefined) query.tids = String(params.tids)
  return client.get('/x/web-interface/wbi/search/all/v2', query, 'wbi')
}

/** 搜索建议 */
export async function searchSuggest(
  client: BiliClient,
  params: SuggestParams,
): Promise<BiliApiResponse> {
  return client.get('/x/web-interface/wbi/search/default', { term: params.term }, 'wbi')
}

/** 热搜榜 */
export async function getHotSearch(client: BiliClient): Promise<BiliApiResponse> {
  return client.get('/x/web-interface/wbi/search/square', {}, 'wbi')
}
