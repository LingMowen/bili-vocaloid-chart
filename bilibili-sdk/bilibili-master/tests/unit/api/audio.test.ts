/**
 * Audio API 单元测试
 */
import { describe, expect, it, vi, afterEach } from 'vitest'

import {
  getAudioInfo,
  getAudioList,
  getAudioDownloadUrl,
  getAudioMenuInfo,
  getAudioHomepageRecommend,
} from '../../../src/api'
import type { BiliClient } from '../../../src/transport'

const mockGet = vi.fn()
const mockClient = { get: mockGet, post: vi.fn() } as unknown as BiliClient

describe('audio', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getAudioInfo', () => {
    it('传递 sid', async () => {
      await getAudioInfo(mockClient, 12345)
      expect(mockGet).toHaveBeenCalledWith(
        'https://www.bilibili.com/audio/music-service-c/web/song/info',
        { sid: '12345' },
      )
    })
  })

  describe('getAudioList', () => {
    it('默认参数', async () => {
      await getAudioList(mockClient)
      expect(mockGet).toHaveBeenCalledWith(
        'https://www.bilibili.com/audio/music-service-c/web/song/list',
        { type: '1', genre: '', lang: '', keyword: '', pn: '1', ps: '30' },
      )
    })

    it('自定义参数', async () => {
      await getAudioList(mockClient, {
        type: 2,
        genre: 'pop',
        lang: 'zh',
        keyword: 'test',
        page: 3,
        pageSize: 10,
      })
      expect(mockGet).toHaveBeenCalledWith(
        'https://www.bilibili.com/audio/music-service-c/web/song/list',
        { type: '2', genre: 'pop', lang: 'zh', keyword: 'test', pn: '3', ps: '10' },
      )
    })
  })

  describe('getAudioDownloadUrl', () => {
    it('传递 sid', async () => {
      await getAudioDownloadUrl(mockClient, 12345)
      expect(mockGet).toHaveBeenCalledWith(
        'https://www.bilibili.com/audio/music-service-c/web/url',
        { sid: '12345', privilege: '2', quality: '2' },
      )
    })
  })

  describe('getAudioMenuInfo', () => {
    it('传递 sid', async () => {
      await getAudioMenuInfo(mockClient, 67890)
      expect(mockGet).toHaveBeenCalledWith(
        'https://www.bilibili.com/audio/music-service-c/web/menu/info',
        { sid: '67890' },
      )
    })
  })

  describe('getAudioHomepageRecommend', () => {
    it('固定参数', async () => {
      await getAudioHomepageRecommend(mockClient)
      expect(mockGet).toHaveBeenCalledWith('/x/web-show/res/locs', {
        pf: '0',
        ids: '3715,3721,3727,3729,3737,3739,3745,3747,3749,3751,3756',
      })
    })
  })
})
