/**
 * Garb (装扮) API 单元测试
 */
import { describe, expect, it, vi, afterEach } from 'vitest'

import { searchGarb, getGarbList, getDlcBasic, getGarbDetail } from '../../../src/api'
import type { BiliClient } from '../../../src/transport'

const mockGet = vi.fn()
const mockClient = { get: mockGet, post: vi.fn() } as unknown as BiliClient

describe('garb', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('searchGarb', () => {
    it('必需参数 keyword', async () => {
      await searchGarb(mockClient, 'test')
      expect(mockGet).toHaveBeenCalledWith('/x/garb/v2/mall/home/search', {
        key_word: 'test',
        pn: '1',
        ps: '20',
      })
    })

    it('自定义分页', async () => {
      await searchGarb(mockClient, 'test', 3, 50)
      expect(mockGet).toHaveBeenCalledWith('/x/garb/v2/mall/home/search', {
        key_word: 'test',
        pn: '3',
        ps: '50',
      })
    })
  })

  describe('getGarbList', () => {
    it('默认参数', async () => {
      await getGarbList(mockClient)
      expect(mockGet).toHaveBeenCalledWith('/x/garb/v2/mall/partition/item/list', {
        group_id: '0',
        part_id: '6',
        sort_type: '0',
        pn: '1',
        ps: '20',
      })
    })

    it('自定义参数', async () => {
      await getGarbList(mockClient, { groupId: 1, partId: 2, sortType: 3, page: 4, pageSize: 10 })
      expect(mockGet).toHaveBeenCalledWith('/x/garb/v2/mall/partition/item/list', {
        group_id: '1',
        part_id: '2',
        sort_type: '3',
        pn: '4',
        ps: '10',
      })
    })
  })

  describe('getDlcBasic', () => {
    it('传递 act_id', async () => {
      await getDlcBasic(mockClient, 12345)
      expect(mockGet).toHaveBeenCalledWith('/x/vas/dlc_act/act/basic', { act_id: '12345' })
    })
  })

  describe('getGarbDetail', () => {
    it('传递 item_id', async () => {
      await getGarbDetail(mockClient, 67890)
      expect(mockGet).toHaveBeenCalledWith('/x/garb/v2/mall/suit/detail', { item_id: '67890' })
    })
  })
})
