/**
 * Creative (创作中心) API 单元测试
 */
import { describe, expect, it, vi, afterEach } from 'vitest'

import {
  getCreativeCompare,
  getCreativeGraph,
  getCreativeNum,
  getCreativeFanOverview,
} from '../../../src/api'
import type { BiliClient } from '../../../src/transport'

const mockGet = vi.fn()
const mockClient = { get: mockGet, post: vi.fn() } as unknown as BiliClient

describe('creative', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getCreativeCompare', () => {
    it('GET cookie 鉴权', async () => {
      await getCreativeCompare(mockClient)
      expect(mockGet).toHaveBeenCalledWith(
        'https://member.bilibili.com/x/web/data/v2/overview/compare',
        {},
        'cookie',
      )
    })
  })

  describe('getCreativeGraph', () => {
    it('传递 period 和 type', async () => {
      await getCreativeGraph(mockClient, 7, 'play')
      expect(mockGet).toHaveBeenCalledWith(
        'https://member.bilibili.com/x/web/data/v2/overview/stat/graph',
        { period: '7', s_locale: 'zh_CN', type: 'play' },
        'cookie',
      )
    })
  })

  describe('getCreativeNum', () => {
    it('传递 period', async () => {
      await getCreativeNum(mockClient, 30)
      expect(mockGet).toHaveBeenCalledWith(
        'https://member.bilibili.com/x/web/data/v2/overview/stat/num',
        { period: '30', s_locale: 'zh_CN' },
        'cookie',
      )
    })
  })

  describe('getCreativeFanOverview', () => {
    it('传递 period', async () => {
      await getCreativeFanOverview(mockClient, 7)
      expect(mockGet).toHaveBeenCalledWith(
        'https://member.bilibili.com/x/web/data/v2/fans/stat/num',
        { period: '7' },
        'cookie',
      )
    })
  })
})
