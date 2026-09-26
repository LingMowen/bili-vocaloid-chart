/**
 * 登录 API — TV 端（来自 bili-hardcore）
 *
 * TV 端扫码登录，函数名加 `Tv` 后缀以区分 Web 端
 */

import type { BiliClient } from '../../transport'
import type { BiliApiResponse } from '../../types'

// TV 端扫码登录

/** TV 端获取二维码 auth_code */
export async function getQrCodeTv(
  client: BiliClient,
): Promise<BiliApiResponse<{ url: string; auth_code: string }>> {
  return client.post(
    'https://passport.bilibili.com/x/passport-tv-login/qrcode/auth_code',
    { local_id: '0' },
    'app',
  )
}

/** TV 端轮询扫码状态 */
export async function pollQrCodeTv(client: BiliClient, authCode: string): Promise<BiliApiResponse> {
  return client.post(
    'https://passport.bilibili.com/x/passport-tv-login/qrcode/poll',
    {
      auth_code: authCode,
      local_id: '0',
    },
    'app',
  )
}

/** TV 端获取账户信息（APP 签名） */
export async function getAccountInfoTv(client: BiliClient): Promise<BiliApiResponse> {
  return client.get('https://app.bilibili.com/x/v2/account/myinfo', {}, 'app')
}
