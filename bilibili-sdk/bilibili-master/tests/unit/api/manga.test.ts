/**
 * Manga API 单元测试
 */
import { describe, expect, it, vi, afterEach } from 'vitest'

import {
  getMangaDetail,
  getMangaEpisode,
  getMangaEpisodeImages,
  getMangaDailyUpdate,
} from '../../../src/api'
import type { BiliClient } from '../../../src/transport'

const mockPost = vi.fn()
const mockClient = { get: vi.fn(), post: mockPost } as unknown as BiliClient

describe('manga', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getMangaDetail', () => {
    it('POST 请求 cookie 鉴权', async () => {
      await getMangaDetail(mockClient, 12345)
      expect(mockPost).toHaveBeenCalledWith(
        'https://manga.bilibili.com/twirp/comic.v1.Comic/ComicDetail',
        { comic_id: '12345' },
        'cookie',
      )
    })
  })

  describe('getMangaEpisode', () => {
    it('传递 episodeId', async () => {
      await getMangaEpisode(mockClient, 67890)
      expect(mockPost).toHaveBeenCalledWith(
        'https://manga.bilibili.com/twirp/comic.v1.Comic/GetEpisode',
        { id: '67890' },
        'cookie',
      )
    })
  })

  describe('getMangaEpisodeImages', () => {
    it('传递 epId', async () => {
      await getMangaEpisodeImages(mockClient, 11111)
      expect(mockPost).toHaveBeenCalledWith(
        'https://manga.bilibili.com/twirp/comic.v1.Comic/GetImageIndex',
        { ep_id: '11111' },
        'cookie',
      )
    })
  })

  describe('getMangaDailyUpdate', () => {
    it('无参数', async () => {
      await getMangaDailyUpdate(mockClient)
      expect(mockPost).toHaveBeenCalledWith(
        'https://manga.bilibili.com/twirp/comic.v1.Comic/GetDailyPush',
        {},
        'cookie',
      )
    })
  })
})
