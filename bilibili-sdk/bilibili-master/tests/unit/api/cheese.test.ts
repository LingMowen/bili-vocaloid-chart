/**
 * Cheese (课程) API 单元测试
 */
import { describe, expect, it, vi, afterEach } from 'vitest'

import { getCheeseMeta, getCheeseList, getCheesePlayUrl } from '../../../src/api'
import type { BiliClient } from '../../../src/transport'

const mockGet = vi.fn()
const mockClient = { get: mockGet, post: vi.fn() } as unknown as BiliClient

describe('cheese', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getCheeseMeta', () => {
    it('使用 seasonId', async () => {
      await getCheeseMeta(mockClient, { seasonId: 12345 })
      expect(mockGet).toHaveBeenCalledWith('/pugv/view/web/season', { season_id: '12345' })
    })

    it('使用 epId', async () => {
      await getCheeseMeta(mockClient, { epId: 67890 })
      expect(mockGet).toHaveBeenCalledWith('/pugv/view/web/season', { ep_id: '67890' })
    })

    it('无参数', async () => {
      await getCheeseMeta(mockClient, {})
      expect(mockGet).toHaveBeenCalledWith('/pugv/view/web/season', {})
    })
  })

  describe('getCheeseList', () => {
    it('必需参数 seasonId', async () => {
      await getCheeseList(mockClient, 12345)
      expect(mockGet).toHaveBeenCalledWith('/pugv/view/web/ep/list', {
        season_id: '12345',
        pn: '1',
        ps: '50',
      })
    })

    it('自定义分页', async () => {
      await getCheeseList(mockClient, 12345, 3, 20)
      expect(mockGet).toHaveBeenCalledWith('/pugv/view/web/ep/list', {
        season_id: '12345',
        pn: '3',
        ps: '20',
      })
    })
  })

  describe('getCheesePlayUrl', () => {
    it('传递 avid + cid + epId', async () => {
      await getCheesePlayUrl(mockClient, { aid: 100, cid: 200, epId: 300 })
      expect(mockGet).toHaveBeenCalledWith('/pugv/player/web/playurl', {
        avid: '100',
        cid: '200',
        ep_id: '300',
        qn: '127',
        fnval: '4048',
        fourk: '1',
      })
    })
  })
})
