/**
 * 相簿 API
 */

import type { BiliClient } from '../../transport'
import type { BiliApiResponse } from '../../types'

/** 获取相簿信息 */
export async function getAlbumInfo(client: BiliClient, docId: number): Promise<BiliApiResponse> {
  return client.get('https://api.vc.bilibili.com/link_draw/v1/doc/detail', {
    doc_id: String(docId),
  })
}

/** 获取相簿列表（用户） */
export async function getAlbumListByUser(
  client: BiliClient,
  uid: number,
  params: { page?: number; pageSize?: number; biz?: number } = {},
): Promise<BiliApiResponse> {
  return client.get('https://api.vc.bilibili.com/link_draw/v2/doc/list', {
    uid: String(uid),
    page_num: String(params.page ?? 0),
    page_size: String(params.pageSize ?? 30),
    biz: String(params.biz ?? 2),
  })
}
