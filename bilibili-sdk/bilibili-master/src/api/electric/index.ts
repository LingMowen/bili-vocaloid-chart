/**
 * 充电 API
 */

import type { BiliClient } from '../../transport'
import type { BiliApiResponse } from '../../types'

/** 获取充电列表 */
export async function getElectricList(client: BiliClient, mid: number): Promise<BiliApiResponse> {
  return client.get(
    '/x/web-interface/elec/show',
    {
      mid: String(mid),
    },
    'cookie',
  )
}

/** 获取 B 币余额 */
export async function getBCoinBalance(client: BiliClient): Promise<BiliApiResponse> {
  return client.get('/x/web-interface/coin/today/exp', {}, 'cookie')
}
