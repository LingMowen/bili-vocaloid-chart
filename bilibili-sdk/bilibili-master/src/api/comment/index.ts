/**
 * 评论 API
 */

import type { BiliClient } from '../../transport'
import type { BiliApiResponse } from '../../types'

// 参数

export interface GetCommentsParams {
  /** 目标 ID（视频 av、动态 id 等） */
  oid: number
  /** 类型：1=视频, 12=专栏, 17=文字动态, 11=图文动态 */
  type: number
  /** 页码 */
  page?: number
  /** 排序：2=按热度, 3=按时间 */
  sort?: number
}

// API 函数

/** 获取评论列表 */
export async function getComments(
  client: BiliClient,
  params: GetCommentsParams,
): Promise<BiliApiResponse> {
  return client.get(
    '/x/v2/reply/wbi/main',
    {
      oid: String(params.oid),
      type: String(params.type),
      mode: '3',
      pagination_str: JSON.stringify({
        offset: `{"type":${String(params.sort ?? 2)},"direction":1,"data":{"pn":${String(params.page ?? 1)}}}`,
      }),
    },
    'wbi',
  )
}

/** 获取评论回复 */
export async function getCommentReplies(
  client: BiliClient,
  params: {
    oid: number
    type: number
    root: number
    page?: number
  },
): Promise<BiliApiResponse> {
  return client.get(
    '/x/v2/reply/reply',
    {
      oid: String(params.oid),
      type: String(params.type),
      root: String(params.root),
      pagination_str: JSON.stringify({
        offset: `{"type":2,"direction":1,"data":{"pn":${String(params.page ?? 1)}}}`,
      }),
    },
    'cookie',
  )
}

export * from './action.js'
