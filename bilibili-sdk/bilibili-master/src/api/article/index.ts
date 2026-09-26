/**
 * 专栏文章 API
 */

import type { BiliClient } from '../../transport'
import type { BiliApiResponse } from '../../types'

// API 函数

/** 获取文章信息 */
export async function getArticleInfo(
  client: BiliClient,
  params: { id: number },
): Promise<BiliApiResponse> {
  return client.get('/x/article/viewinfo', { id: String(params.id) }, 'cookie')
}

/** 获取文章列表（按用户） */
export async function getArticlesByUser(
  client: BiliClient,
  params: { mid: number; page?: number; pageSize?: number },
): Promise<BiliApiResponse> {
  return client.get(
    '/x/space/wbi/article',
    {
      mid: String(params.mid),
      pn: String(params.page ?? 1),
      ps: String(params.pageSize ?? 12),
    },
    'wbi',
  )
}

/** 获取文章分类 */
export async function getArticleCategories(client: BiliClient): Promise<BiliApiResponse> {
  return client.get('/x/article/category/list', {}, 'none')
}
