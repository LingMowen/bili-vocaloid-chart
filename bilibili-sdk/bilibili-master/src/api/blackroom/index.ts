/**
 * 小黑屋 API
 */

import type { BiliClient } from '../../transport'
import type { BiliApiResponse } from '../../types'

/** 获取小黑屋列表 */
export async function getBlockedList(
  client: BiliClient,
  params: {
    blockType?: number
    originType?: number
    page?: number
  } = {},
): Promise<BiliApiResponse> {
  const query: Record<string, string> = { pn: String(params.page ?? 1) }
  if (params.blockType !== undefined) query.btype = String(params.blockType)
  if (params.originType !== undefined) query.otype = String(params.originType)
  return client.get('/x/credit/blocked/list', query)
}

/** 获取小黑屋详情 */
export async function getBlockedDetail(client: BiliClient, id: string): Promise<BiliApiResponse> {
  return client.get('/x/credit/blocked/info', { id })
}

/** 获取案件仲裁详情 */
export async function getJuryCase(client: BiliClient, caseId: string): Promise<BiliApiResponse> {
  return client.get('/x/credit/v2/jury/case/info', { case_id: caseId }, 'cookie')
}

/** 风纪委员投票 */
export async function juryVote(
  client: BiliClient,
  params: {
    caseId: string
    vote: number
    content: string
    insiders?: number
    anonymous?: number
  },
): Promise<BiliApiResponse> {
  return client.post(
    '/x/credit/v2/jury/vote',
    {
      case_id: params.caseId,
      vote: String(params.vote),
      content: params.content,
      insiders: String(params.insiders ?? 0),
      anonymous: String(params.anonymous ?? 0),
    },
    'cookie',
  )
}
