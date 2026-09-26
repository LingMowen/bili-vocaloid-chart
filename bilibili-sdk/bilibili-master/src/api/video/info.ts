/**
 * 视频信息 API
 */

import type { BiliClient } from '../../transport'
import type { BiliApiResponse, BiliVideoPage, BiliVideoStat } from '../../types'

// 参数类型

export interface VideoIdParam {
  aid?: number
  bvid?: string
}

// 响应数据类型

/** 视频详细信息 */
export interface VideoInfoData {
  bvid: string
  aid: number
  videos: number
  tid: number
  tname: string
  copyright: number
  pic: string
  title: string
  pubdate: number
  ctime: number
  desc: string
  duration: number
  cid: number
  pages: BiliVideoPage[]
  stat: BiliVideoStat
  owner: {
    mid: number
    name: string
    face: string
  }
}

// 工具

/** 将参数对象转为 Record<string, string> */
function vidParams(params: VideoIdParam): Record<string, string> {
  const result: Record<string, string> = {}
  if (params.aid !== undefined) result.aid = String(params.aid)
  if (params.bvid !== undefined) result.bvid = params.bvid
  return result
}

// API 函数

/** 获取视频状态数（简化版） */
export async function getVideoStat(
  client: BiliClient,
  params: VideoIdParam,
): Promise<BiliApiResponse<BiliVideoStat>> {
  return client.get<BiliVideoStat>('/x/web-interface/archive/stat', vidParams(params), 'none')
}

/** 获取视频详细信息（无需 wbi 签名） */
export async function getVideoInfo(
  client: BiliClient,
  params: VideoIdParam,
): Promise<BiliApiResponse<VideoInfoData>> {
  return client.get<VideoInfoData>('/x/web-interface/view', vidParams(params), 'cookie')
}

/** 获取视频详细信息（wbi 签名版） */
export async function getVideoInfoDetail(
  client: BiliClient,
  params: VideoIdParam,
): Promise<BiliApiResponse<VideoInfoData>> {
  return client.get<VideoInfoData>('/x/web-interface/wbi/view/detail', vidParams(params), 'wbi')
}

/** 获取视频分 P 列表 */
export async function getVideoPages(
  client: BiliClient,
  params: VideoIdParam,
): Promise<BiliApiResponse<BiliVideoPage[]>> {
  return client.get<BiliVideoPage[]>('/x/player/pagelist', vidParams(params), 'none')
}

/** 获取关联视频 */
export async function getRelatedVideos(
  client: BiliClient,
  params: VideoIdParam,
): Promise<BiliApiResponse<unknown[]>> {
  return client.get<unknown[]>('/x/web-interface/archive/related', vidParams(params), 'none')
}

/** 获取视频标签 */
export async function getVideoTags(
  client: BiliClient,
  params: VideoIdParam,
): Promise<BiliApiResponse<unknown[]>> {
  return client.get<unknown[]>('/x/web-interface/view/detail/tag', vidParams(params), 'none')
}

/** 获取视频快照 */
export async function getVideoSnapshot(
  client: BiliClient,
  params: { aid?: number; bvid?: string; cid: number; index?: number },
): Promise<BiliApiResponse> {
  const query: Record<string, string> = {
    cid: String(params.cid),
  }
  if (params.aid !== undefined) query.aid = String(params.aid)
  if (params.bvid) query.bvid = params.bvid
  if (params.index !== undefined) query.index = String(params.index)
  return client.get('/x/player/videoshot', query, 'none')
}
