/**
 * 笔记 API
 */

import type { BiliClient } from '../../transport'
import type { BiliApiResponse } from '../../types'

/** 获取公开笔记详情 */
export async function getNoteDetail(client: BiliClient, cvid: number): Promise<BiliApiResponse> {
  return client.get('/x/note/publish/info', { cvid: String(cvid) })
}

/** 获取私有笔记详情 */
export async function getPrivateNoteDetail(
  client: BiliClient,
  params: { oid: number; oidType: number; noteId: number },
): Promise<BiliApiResponse> {
  return client.get(
    '/x/note/info',
    {
      oid: String(params.oid),
      oid_type: String(params.oidType),
      note_id: String(params.noteId),
    },
    'cookie',
  )
}

/** 获取稿件公开笔记列表 */
export async function getVideoPublicNotes(
  client: BiliClient,
  oid: number,
  oidType: number,
  page?: number,
  pageSize?: number,
): Promise<BiliApiResponse> {
  return client.get('/x/note/publish/list/archive', {
    oid: String(oid),
    oid_type: String(oidType),
    pn: String(page ?? 1),
    ps: String(pageSize ?? 10),
  })
}
