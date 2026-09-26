/**
 * Fav (收藏夹) API 单元测试
 */
import { describe, expect, it, vi, afterEach } from 'vitest'

import { getFavList, getFavInfo, getFavContent, addFavVideo } from '../../../src/api'
import type { BiliClient } from '../../../src/transport'

const mockGet = vi.fn()
const mockPost = vi.fn()
const mockClient = { get: mockGet, post: mockPost } as unknown as BiliClient

describe('fav', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getFavList', () => {
    it('必需参数 mid', async () => {
      await getFavList(mockClient, 123456)
      expect(mockGet).toHaveBeenCalledWith(
        '/x/v3/fav/folder/created/list-all',
        { up_mid: '123456', web_location: '333.1387' },
        'cookie',
      )
    })

    it('带 type 和 rid', async () => {
      await getFavList(mockClient, 123456, 2, 789)
      expect(mockGet).toHaveBeenCalledWith(
        '/x/v3/fav/folder/created/list-all',
        { up_mid: '123456', web_location: '333.1387', type: '2', rid: '789' },
        'cookie',
      )
    })
  })

  describe('getFavInfo', () => {
    it('传递 media_id', async () => {
      await getFavInfo(mockClient, 12345)
      expect(mockGet).toHaveBeenCalledWith('/x/v3/fav/folder/info', { media_id: '12345' })
    })
  })

  describe('getFavContent', () => {
    it('必需参数 mediaId', async () => {
      await getFavContent(mockClient, { mediaId: 12345 })
      expect(mockGet).toHaveBeenCalledWith('/x/v3/fav/resource/list', {
        media_id: '12345',
        pn: '1',
        ps: '20',
        keyword: '',
        order: 'mtime',
        type: '0',
        tid: '0',
        platform: 'web',
        web_location: '333.1387',
      })
    })

    it('自定义参数', async () => {
      await getFavContent(mockClient, {
        mediaId: 12345,
        page: 3,
        ps: 50,
        keyword: 'test',
        order: 'view',
        tid: 1,
      })
      expect(mockGet).toHaveBeenCalledWith(
        '/x/v3/fav/resource/list',
        expect.objectContaining({
          media_id: '12345',
          pn: '3',
          ps: '50',
          keyword: 'test',
          order: 'view',
          tid: '1',
        }),
      )
    })
  })

  describe('addFavVideo', () => {
    it('添加到收藏夹', async () => {
      await addFavVideo(mockClient, 170001, [1, 2, 3])
      expect(mockPost).toHaveBeenCalledWith(
        '/x/v3/fav/resource/deal',
        {
          rid: '170001',
          type: '2',
          add_media_ids: '1,2,3',
          del_media_ids: '',
        },
        'cookie',
      )
    })

    it('从收藏夹删除', async () => {
      await addFavVideo(mockClient, 170001, [], [3, 4])
      expect(mockPost).toHaveBeenCalledWith(
        '/x/v3/fav/resource/deal',
        {
          rid: '170001',
          type: '2',
          add_media_ids: '',
          del_media_ids: '3,4',
        },
        'cookie',
      )
    })
  })
})
