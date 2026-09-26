/**
 * 表情包 API
 */

import type { BiliClient } from '../../transport'
import type { BiliApiResponse } from '../../types'

/** 获取表情包列表 */
export async function getEmojiList(
  client: BiliClient,
  business: 'reply' | 'dynamic' = 'reply',
): Promise<BiliApiResponse> {
  return client.get('/x/emote/user/panel/web', { business })
}

/** 获取所有表情包 */
export async function getAllEmojis(
  client: BiliClient,
  business: 'reply' | 'dynamic' = 'reply',
): Promise<BiliApiResponse> {
  return client.get('/x/emote/setting/panel', { business }, 'cookie')
}

/** 获取表情包系列明细 */
export async function getEmojiDetail(
  client: BiliClient,
  ids: number | number[],
  business: 'reply' | 'dynamic' = 'reply',
): Promise<BiliApiResponse> {
  const idStr = Array.isArray(ids) ? ids.join(',') : String(ids)
  return client.get('/x/emote/package', {
    business,
    ids: idStr,
  })
}

/** 添加表情包 */
export async function addEmojiPackage(
  client: BiliClient,
  packageId: number,
  business: 'reply' | 'dynamic' = 'reply',
): Promise<BiliApiResponse> {
  return client.post(
    '/x/emote/package/add',
    {
      package_id: String(packageId),
      business,
    },
    'cookie',
  )
}
