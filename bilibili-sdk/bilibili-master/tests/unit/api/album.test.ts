/**
 * Album (相簿) API 单元测试
 */
import { describe, expect, it, vi, afterEach } from 'vitest'

import { getAlbumInfo, getAlbumListByUser } from '../../../src/api'
import type { BiliClient } from '../../../src/transport'

const mockGet = vi.fn()
const mockClient = { get: mockGet, post: vi.fn() } as unknown as BiliClient

describe('album', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getAlbumInfo', () => {
    it('传递 doc_id', async () => {
      await getAlbumInfo(mockClient, 12345)
      expect(mockGet).toHaveBeenCalledWith('https://api.vc.bilibili.com/link_draw/v1/doc/detail', {
        doc_id: '12345',
      })
    })
  })

  describe('getAlbumListByUser', () => {
    it('必需参数 uid', async () => {
      await getAlbumListByUser(mockClient, 123456)
      expect(mockGet).toHaveBeenCalledWith('https://api.vc.bilibili.com/link_draw/v2/doc/list', {
        uid: '123456',
        page_num: '0',
        page_size: '30',
        biz: '2',
      })
    })

    it('自定义分页和 biz', async () => {
      await getAlbumListByUser(mockClient, 123456, { page: 2, pageSize: 10, biz: 1 })
      expect(mockGet).toHaveBeenCalledWith('https://api.vc.bilibili.com/link_draw/v2/doc/list', {
        uid: '123456',
        page_num: '2',
        page_size: '10',
        biz: '1',
      })
    })
  })
})
