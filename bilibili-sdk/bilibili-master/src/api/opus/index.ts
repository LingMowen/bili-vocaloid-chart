/**
 * 图文动态 (Opus) API
 */

import type { BiliClient } from '../../transport'
import type { BiliApiResponse } from '../../types'

/** 获取图文动态详情 */
export async function getOpusDetail(client: BiliClient, id: string): Promise<BiliApiResponse> {
  return client.get('/x/polymer/web-dynamic/v1/opus/detail', {
    timezone_offset: '-480',
    id,
  })
}
