/**
 * 评论操作 API（动作类）
 */

import type { BiliClient } from '../../transport'
import type { BiliApiResponse } from '../../types'

/** 发送评论 */
export async function sendComment(
  client: BiliClient,
  params: {
    oid: number
    type: number
    message: string
    root?: number
    parent?: number
  },
): Promise<BiliApiResponse> {
  return client.post(
    '/x/v2/reply/add',
    {
      oid: String(params.oid),
      type: String(params.type),
      message: params.message,
      root: params.root ? String(params.root) : '',
      parent: params.parent ? String(params.parent) : '',
      plat: '1',
    },
    'cookie',
  )
}

/** 删除评论 */
export async function deleteComment(
  client: BiliClient,
  params: {
    oid: number
    type: number
    rpid: number
  },
): Promise<BiliApiResponse> {
  return client.post(
    '/x/v2/reply/del',
    {
      oid: String(params.oid),
      type: String(params.type),
      rpid: String(params.rpid),
    },
    'cookie',
  )
}

/** 点赞评论 */
export async function likeComment(
  client: BiliClient,
  params: {
    oid: number
    type: number
    rpid: number
    like: boolean
  },
): Promise<BiliApiResponse> {
  return client.post(
    '/x/v2/reply/action',
    {
      oid: String(params.oid),
      type: String(params.type),
      rpid: String(params.rpid),
      action: params.like ? '1' : '0',
    },
    'cookie',
  )
}
