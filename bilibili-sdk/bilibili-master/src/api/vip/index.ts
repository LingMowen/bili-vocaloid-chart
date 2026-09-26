/**
 * 大会员 API
 */

import type { BiliClient } from '../../transport'
import type { BiliApiResponse } from '../../types'

/** 获取大会员信息 */
export async function getVipInfo(client: BiliClient): Promise<BiliApiResponse> {
  return client.get('/x/vip/web/user/info', {}, 'cookie')
}

/** 大会员签到 */
export async function vipClockIn(client: BiliClient): Promise<BiliApiResponse> {
  return client.post(
    '/pgc/activity/deliver/task/complete',
    {
      position: 'vip_point',
    },
    'cookie',
  )
}

/** 获取大会员权益 */
export async function getVipCenter(client: BiliClient): Promise<BiliApiResponse> {
  return client.get('/x/vip/web/vip_center/combine', {}, 'cookie')
}
