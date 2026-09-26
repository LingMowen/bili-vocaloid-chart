/**
 * Login API 单元测试（Web + TV）
 */
import { describe, expect, it, vi, afterEach } from 'vitest'

import {
  getQrCodeUrl,
  pollQrCode,
  getLoginStatus,
  refreshCookie,
  logout,
  getQrCodeTv,
  pollQrCodeTv,
  getAccountInfoTv,
} from '../../../src/api'
import type { BiliClient } from '../../../src/transport'

const mockGet = vi.fn()
const mockPost = vi.fn()
const mockClient = { get: mockGet, post: mockPost } as unknown as BiliClient

describe('login / web', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getQrCodeUrl', () => {
    it('无参数 GET 使用 passport 域名', async () => {
      await getQrCodeUrl(mockClient)
      expect(mockGet).toHaveBeenCalledWith(
        'https://passport.bilibili.com/x/passport-login/web/qrcode/generate',
        {},
        'none',
      )
    })
  })

  describe('pollQrCode', () => {
    it('传递 qrcode_key', async () => {
      await pollQrCode(mockClient, 'abc123')
      expect(mockGet).toHaveBeenCalledWith(
        'https://passport.bilibili.com/x/passport-login/web/qrcode/poll',
        { qrcode_key: 'abc123' },
        'none',
      )
    })
  })

  describe('getLoginStatus', () => {
    it('传递 cookie 鉴权', async () => {
      await getLoginStatus(mockClient)
      expect(mockGet).toHaveBeenCalledWith('/x/web-interface/nav', {}, 'cookie')
    })
  })

  describe('refreshCookie', () => {
    it('POST 刷新 cookie', async () => {
      await refreshCookie(mockClient, 'refresh123')
      expect(mockPost).toHaveBeenCalledWith(
        'https://passport.bilibili.com/x/passport-login/web/cookie/refresh',
        { csrf: '', refresh_token: 'refresh123' },
        'cookie',
      )
    })
  })

  describe('logout', () => {
    it('POST 请求', async () => {
      await logout(mockClient)
      expect(mockPost).toHaveBeenCalledWith(
        'https://passport.bilibili.com/x/passport-login/web/logout',
        { csrf: '' },
        'cookie',
      )
    })
  })
})

describe('login / tv', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getQrCodeTv', () => {
    it('POST 请求带 app 签名', async () => {
      await getQrCodeTv(mockClient)
      expect(mockPost).toHaveBeenCalledWith(
        'https://passport.bilibili.com/x/passport-tv-login/qrcode/auth_code',
        { local_id: '0' },
        'app',
      )
    })
  })

  describe('pollQrCodeTv', () => {
    it('传递 auth_code', async () => {
      await pollQrCodeTv(mockClient, 'tv-code')
      expect(mockPost).toHaveBeenCalledWith(
        'https://passport.bilibili.com/x/passport-tv-login/qrcode/poll',
        { auth_code: 'tv-code', local_id: '0' },
        'app',
      )
    })
  })

  describe('getAccountInfoTv', () => {
    it('GET 请求带 app 签名', async () => {
      await getAccountInfoTv(mockClient)
      expect(mockGet).toHaveBeenCalledWith(
        'https://app.bilibili.com/x/v2/account/myinfo',
        {},
        'app',
      )
    })
  })
})
