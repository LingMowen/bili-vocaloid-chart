/**
 * 用户操作 API（动作类）
 */

import type { BiliClient } from '../../transport'
import type { BiliApiResponse } from '../../types'

/** 关注用户 */
export async function followUser(client: BiliClient, mid: number): Promise<BiliApiResponse> {
  return client.post(
    '/x/relation/modify',
    {
      fid: String(mid),
      act: '1',
    },
    'cookie',
  )
}

/** 取消关注 */
export async function unfollowUser(client: BiliClient, mid: number): Promise<BiliApiResponse> {
  return client.post(
    '/x/relation/modify',
    {
      fid: String(mid),
      act: '2',
    },
    'cookie',
  )
}
