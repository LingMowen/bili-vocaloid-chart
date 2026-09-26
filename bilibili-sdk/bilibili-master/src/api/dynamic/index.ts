/**
 * 动态 API
 */

import type { BiliClient } from '../../transport'
import type { BiliApiResponse } from '../../types'

// 参数

export interface GetDynamicParams {
  /** 页码 */
  page?: number
  /** 偏移 */
  offset?: string
  /** 平台 */
  platform?: string
}

export interface GetSpaceDynamicParams {
  /** 用户 UID */
  hostUid: number
  /** 偏移 */
  offset?: string
}

// API 函数

/** 获取动态列表（主页推荐） */
export async function getDynamicList(
  client: BiliClient,
  params: GetDynamicParams = {},
): Promise<BiliApiResponse> {
  return client.get(
    '/x/polymer/web-dynamic/v1/feed/all',
    {
      page: String(params.page ?? 1),
      offset: params.offset ?? '',
      platform: params.platform ?? 'web',
    },
    'cookie',
  )
}

/** 获取用户空间动态 */
export async function getSpaceDynamic(
  client: BiliClient,
  params: GetSpaceDynamicParams,
): Promise<BiliApiResponse> {
  return client.get(
    '/x/polymer/web-dynamic/v1/feed/space',
    {
      host_uid: String(params.hostUid),
      offset: params.offset ?? '',
    },
    'cookie',
  )
}

/** 获取动态详情 */
export async function getDynamicDetail(
  client: BiliClient,
  dynamicId: string,
): Promise<BiliApiResponse> {
  return client.get('/x/polymer/web-dynamic/v1/detail', { id: dynamicId }, 'cookie')
}

export { likeDynamic } from './action.js'
