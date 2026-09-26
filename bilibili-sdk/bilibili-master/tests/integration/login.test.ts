/**
 * Login API 集成测试（Web + TV）
 */
import { expect } from 'vitest'

import {
  getQrCodeTv,
  pollQrCodeTv,
  getAccountInfoTv,
  getQrCodeUrl,
  pollQrCode,
} from '../../src/api'

import {
  createAnonymousClient,
  createCookieClient,
  expectApiSuccess,
  describeIf,
} from './helpers.js'

const client = createAnonymousClient()

describeIf('BILIBILI_SESSDATA')('Login Web API', () => {
  const authed = createCookieClient()!

  it('getLoginStatus 返回登录用户信息', async () => {
    const { getLoginStatus } = await import('../../src/api/login')
    const res = await getLoginStatus(authed)
    expect(res.code).toBe(0)
    expect((res.data as Record<string, unknown>)?.mid).toBeGreaterThan(0)
  })

  it('refreshCookie 返回刷新信息', async () => {
    const { refreshCookie } = await import('../../src/api/login')
    const refreshToken = process.env.BILIBILI_REFRESH_TOKEN
    if (!refreshToken) return
    const res = await refreshCookie(authed, refreshToken)
    expect(res.code).toBe(0)
  })
})

// TV 端接口需要 APP 签名，在匿名客户端下可能失败
describeIf('BILIBILI_ACCESS_TOKEN')('Login TV API', () => {
  it('getQrCodeTv 获取二维码', async () => {
    const res = await expectApiSuccess(() => getQrCodeTv(client))
    if (!res) return
    expect(res.code).toBe(0)
  })

  it('pollQrCodeTv 轮询（预期未扫码）', async () => {
    const res = await expectApiSuccess(() => pollQrCodeTv(client, 'test'))
    // 未扫码或无效 auth_code 会返回非 0 code，但不应抛异常
    expect(res).toBeDefined()
  })

  it('getAccountInfoTv 获取账户信息', async () => {
    const res = await expectApiSuccess(() => getAccountInfoTv(client))
    if (!res) return
    expect(res.code).toBe(0)
  })
})

describe('Login API — 公开端点', () => {
  it('getQrCodeUrl 返回二维码 URL 和 qrcode_key', async () => {
    const res = await expectApiSuccess(() => getQrCodeUrl(client))
    if (!res) return
    expect(res.code).toBe(0)
    expect(res.data.url).toMatch(/^https?:\/\//)
    expect(res.data.qrcode_key).toBeTruthy()
  })

  it('pollQrCode 返回轮询结果（预期未扫码或已失效）', async () => {
    const res = await expectApiSuccess(() => pollQrCode(client, 'test-qrcode-key'))
    if (!res) return
    // 无效 key 返回 data.code 状态码：86101 未扫码 / 86038 已失效，不应为 0
    expect([86038, 86101]).toContain(res.data.code)
  })
})
