/**
 * Bangumi API 单元测试
 */
import { describe, expect, it, vi, afterEach } from 'vitest'

import {
  getBangumiInfo,
  getBangumiTimeline,
  getBangumiSeasonIndex,
  getBangumiRecommend,
} from '../../../src/api'
import type { BiliClient } from '../../../src/transport'

const mockGet = vi.fn()
const mockClient = { get: mockGet, post: vi.fn() } as unknown as BiliClient

describe('bangumi', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getBangumiInfo', () => {
    it('使用 seasonId', async () => {
      await getBangumiInfo(mockClient, { seasonId: 12345 })
      expect(mockGet).toHaveBeenCalledWith('/pgc/view/web/season', { season_id: '12345' }, 'cookie')
    })

    it('使用 epId', async () => {
      await getBangumiInfo(mockClient, { epId: 67890 })
      expect(mockGet).toHaveBeenCalledWith('/pgc/view/web/season', { ep_id: '67890' }, 'cookie')
    })

    it('同时使用 seasonId 和 epId', async () => {
      await getBangumiInfo(mockClient, { seasonId: 1, epId: 2 })
      expect(mockGet).toHaveBeenCalledWith(
        '/pgc/view/web/season',
        { season_id: '1', ep_id: '2' },
        'cookie',
      )
    })

    it('无参数', async () => {
      await getBangumiInfo(mockClient, {})
      expect(mockGet).toHaveBeenCalledWith('/pgc/view/web/season', {}, 'cookie')
    })
  })

  describe('getBangumiTimeline', () => {
    it('无参数', async () => {
      await getBangumiTimeline(mockClient)
      expect(mockGet).toHaveBeenCalledWith('/pgc/web/timeline', {}, 'none')
    })
  })

  describe('getBangumiSeasonIndex', () => {
    it('传递 season_id', async () => {
      await getBangumiSeasonIndex(mockClient, { seasonId: 12345 })
      expect(mockGet).toHaveBeenCalledWith(
        '/pgc/view/web/season/section',
        { season_id: '12345' },
        'none',
      )
    })
  })

  describe('getBangumiRecommend', () => {
    it('无参数', async () => {
      await getBangumiRecommend(mockClient)
      expect(mockGet).toHaveBeenCalledWith('/pgc/web/related/recommend', {}, 'none')
    })
  })
})
