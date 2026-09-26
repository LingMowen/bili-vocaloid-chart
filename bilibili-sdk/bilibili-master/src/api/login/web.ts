/**
 * 登录 API — Web 端
 *
 * 默认使用 Web 端登录接口
 */

import type { BiliClient } from '../../transport'
import type { BiliApiResponse } from '../../types'

// Web 端登录

/**
 * 获取二维码登录 URL 和 qrcode_key
 *
 * 注意：该接口部署在 passport.bilibili.com 而非默认的 api.bilibili.com，须使用完整 URL
 */
export async function getQrCodeUrl(
  client: BiliClient,
): Promise<BiliApiResponse<{ url: string; qrcode_key: string }>> {
  return client.get(
    'https://passport.bilibili.com/x/passport-login/web/qrcode/generate',
    {},
    'none',
  )
}

/**
 * 轮询二维码扫码状态
 *
 * 状态码位于返回体的 data.code：0 成功 / 86101 未扫码 / 86090 已扫码未确认 / 86038 已失效
 */
export async function pollQrCode(
  client: BiliClient,
  qrCodeKey: string,
): Promise<
  BiliApiResponse<{
    url: string
    refresh_token: string
    timestamp: number
    code: number
    message: string
  }>
> {
  return client.get(
    'https://passport.bilibili.com/x/passport-login/web/qrcode/poll',
    { qrcode_key: qrCodeKey },
    'none',
  )
}

/** 获取登录状态 */
export async function getLoginStatus(client: BiliClient): Promise<BiliApiResponse> {
  return client.get('/x/web-interface/nav', {}, 'cookie')
}

/** 刷新 Cookie */
export async function refreshCookie(
  client: BiliClient,
  refreshToken: string,
): Promise<BiliApiResponse> {
  const csrf = client.credential?.biliJct ?? ''
  return client.post(
    'https://passport.bilibili.com/x/passport-login/web/cookie/refresh',
    { csrf, refresh_token: refreshToken },
    'cookie',
  )
}

/** 退出登录 */
export async function logout(client: BiliClient): Promise<BiliApiResponse> {
  const csrf = client.credential?.biliJct ?? ''
  return client.post(
    'https://passport.bilibili.com/x/passport-login/web/logout',
    { csrf },
    'cookie',
  )
}
