/**
 * 用户信息 API
 */

import type { BiliClient } from '../../transport'
import type { BiliApiResponse, BiliOfficial, BiliVip } from '../../types'

// 参数

export interface UserMidParam {
  mid: number
}

// 响应类型

/** 用户空间详细信息 */
export interface UserInfoData {
  mid: number
  name: string
  sex: string
  face: string
  sign: string
  rank: number
  level: number
  coins: number
  fans_badge: boolean
  official: BiliOfficial
  vip: BiliVip
  is_followed: boolean
  top_photo: string
  live_room: {
    roomStatus: number
    liveStatus: number
    url: string
    title: string
    cover: string
    roomid: number
  }
}

/** 用户状态数 */
export interface UserStatData {
  following: number
  follower: number
  dynamic_count: number
}

/** 用户关系 */
export interface UserRelationData {
  mid: number
  following: number
  whisper: number
  black: number
  follower: number
}

// API 函数

/** 获取用户空间详细信息（wbi 签名） */
export async function getUserInfo(
  client: BiliClient,
  params: UserMidParam,
): Promise<BiliApiResponse<UserInfoData>> {
  return client.get<UserInfoData>('/x/space/wbi/acc/info', { mid: String(params.mid) }, 'wbi')
}

/** 获取用户状态数 */
export async function getUserStat(
  client: BiliClient,
  params: UserMidParam,
): Promise<BiliApiResponse<UserStatData>> {
  return client.get<UserStatData>('/x/relation/stat', { vmid: String(params.mid) }, 'cookie')
}

/** 获取用户关系 */
export async function getUserRelation(
  client: BiliClient,
  params: UserMidParam,
): Promise<BiliApiResponse<UserRelationData>> {
  return client.get<UserRelationData>(
    '/x/space/wbi/acc/relation',
    { mid: String(params.mid) },
    'wbi',
  )
}
