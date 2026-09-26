/**
 * VIP (大会员) API 单元测试
 */
import { describe, expect, it, vi, afterEach } from 'vitest'

import { getVipInfo, vipClockIn, getVipCenter } from '../../../src/api'
import type { BiliClient } from '../../../src/transport'

const mockGet = vi.fn()
const mockPost = vi.fn()
const mockClient = { get: mockGet, post: mockPost } as unknown as BiliClient

describe('vip', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getVipInfo', () => {
    it('GET cookie 鉴权', async () => {
      await getVipInfo(mockClient)
      expect(mockGet).toHaveBeenCalledWith('/x/vip/web/user/info', {}, 'cookie')
    })
  })

  describe('vipClockIn', () => {
    it('POST 签到', async () => {
      await vipClockIn(mockClient)
      expect(mockPost).toHaveBeenCalledWith(
        '/pgc/activity/deliver/task/complete',
        { position: 'vip_point' },
        'cookie',
      )
    })
  })

  describe('getVipCenter', () => {
    it('GET cookie 鉴权', async () => {
      await getVipCenter(mockClient)
      expect(mockGet).toHaveBeenCalledWith('/x/vip/web/vip_center/combine', {}, 'cookie')
    })
  })
})
