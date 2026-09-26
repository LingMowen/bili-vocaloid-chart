/**
 * Video API 单元测试
 *
 * 验证每个 API 函数正确调用 BiliClient 的 get/post 方法，
 * 传入正确的 URL、参数和鉴权模式
 */
import { describe, expect, it, vi, afterEach } from 'vitest'

import {
  getVideoStat,
  getVideoInfo,
  getVideoInfoDetail,
  getVideoPages,
  getRelatedVideos,
  getVideoTags,
  getVideoSnapshot,
  likeVideo,
  coinVideo,
  tripleVideo,
} from '../../../src/api'
import type { BiliClient } from '../../../src/transport'

// Mock BiliClient
const mockGet = vi.fn()
const mockPost = vi.fn()
const mockClient = {
  get: mockGet,
  post: mockPost,
} as unknown as BiliClient

describe('video / info', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getVideoStat', () => {
    it('使用 aid', async () => {
      await getVideoStat(mockClient, { aid: 170001 })
      expect(mockGet).toHaveBeenCalledWith(
        '/x/web-interface/archive/stat',
        { aid: '170001' },
        'none',
      )
    })

    it('使用 bvid', async () => {
      await getVideoStat(mockClient, { bvid: 'BV17x411w7KC' })
      expect(mockGet).toHaveBeenCalledWith(
        '/x/web-interface/archive/stat',
        { bvid: 'BV17x411w7KC' },
        'none',
      )
    })
  })

  describe('getVideoInfo', () => {
    it('使用 aid', async () => {
      await getVideoInfo(mockClient, { aid: 170001 })
      expect(mockGet).toHaveBeenCalledWith('/x/web-interface/view', { aid: '170001' }, 'cookie')
    })
  })

  describe('getVideoInfoDetail', () => {
    it('使用 bvid', async () => {
      await getVideoInfoDetail(mockClient, { bvid: 'BV17x411w7KC' })
      expect(mockGet).toHaveBeenCalledWith(
        '/x/web-interface/wbi/view/detail',
        { bvid: 'BV17x411w7KC' },
        'wbi',
      )
    })

    it('aid 优先于 bvid', async () => {
      await getVideoInfoDetail(mockClient, { aid: 1, bvid: 'BV1' })
      expect(mockGet).toHaveBeenCalledWith(
        '/x/web-interface/wbi/view/detail',
        { aid: '1', bvid: 'BV1' },
        'wbi',
      )
    })
  })

  describe('getVideoPages', () => {
    it('传递正确参数', async () => {
      await getVideoPages(mockClient, { aid: 170001 })
      expect(mockGet).toHaveBeenCalledWith('/x/player/pagelist', { aid: '170001' }, 'none')
    })
  })

  describe('getRelatedVideos', () => {
    it('传递正确参数', async () => {
      await getRelatedVideos(mockClient, { aid: 170001 })
      expect(mockGet).toHaveBeenCalledWith(
        '/x/web-interface/archive/related',
        { aid: '170001' },
        'none',
      )
    })
  })

  describe('getVideoTags', () => {
    it('传递正确参数', async () => {
      await getVideoTags(mockClient, { aid: 170001 })
      expect(mockGet).toHaveBeenCalledWith(
        '/x/web-interface/view/detail/tag',
        { aid: '170001' },
        'none',
      )
    })
  })

  describe('getVideoSnapshot', () => {
    it('必需参数 aid+cid', async () => {
      await getVideoSnapshot(mockClient, { aid: 170001, cid: 12345 })
      expect(mockGet).toHaveBeenCalledWith(
        '/x/player/videoshot',
        { aid: '170001', cid: '12345' },
        'none',
      )
    })

    it('可选参数 bvid 和 index', async () => {
      await getVideoSnapshot(mockClient, { bvid: 'BV1xx', cid: 12345, index: 2 })
      expect(mockGet).toHaveBeenCalledWith(
        '/x/player/videoshot',
        { bvid: 'BV1xx', cid: '12345', index: '2' },
        'none',
      )
    })
  })
})

describe('video / action', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('likeVideo', () => {
    it('点赞', async () => {
      await likeVideo(mockClient, { aid: 170001, like: true })
      expect(mockPost).toHaveBeenCalledWith(
        '/x/web-interface/archive/like',
        { aid: '170001', bvid: '', like: '1' },
        'cookie',
      )
    })

    it('取消点赞', async () => {
      await likeVideo(mockClient, { aid: 170001, like: false })
      expect(mockPost).toHaveBeenCalledWith(
        '/x/web-interface/archive/like',
        { aid: '170001', bvid: '', like: '2' },
        'cookie',
      )
    })

    it('使用 bvid', async () => {
      await likeVideo(mockClient, { bvid: 'BV1xx', like: true })
      expect(mockPost).toHaveBeenCalledWith(
        '/x/web-interface/archive/like',
        { aid: '', bvid: 'BV1xx', like: '1' },
        'cookie',
      )
    })
  })

  describe('coinVideo', () => {
    it('默认投币数量为 1', async () => {
      await coinVideo(mockClient, { aid: 170001 })
      expect(mockPost).toHaveBeenCalledWith(
        '/x/web-interface/coin/add',
        { aid: '170001', bvid: '', multiply: '1', select_like: '0' },
        'cookie',
      )
    })

    it('投币 2 枚并点赞', async () => {
      await coinVideo(mockClient, { aid: 170001, count: 2, alsoLike: true })
      expect(mockPost).toHaveBeenCalledWith(
        '/x/web-interface/coin/add',
        { aid: '170001', bvid: '', multiply: '2', select_like: '1' },
        'cookie',
      )
    })

    it('使用 bvid 投币', async () => {
      await coinVideo(mockClient, { bvid: 'BV1xx' })
      expect(mockPost).toHaveBeenCalledWith(
        '/x/web-interface/coin/add',
        { aid: '', bvid: 'BV1xx', multiply: '1', select_like: '0' },
        'cookie',
      )
    })
  })

  describe('tripleVideo', () => {
    it('一键三连', async () => {
      await tripleVideo(mockClient, { aid: 170001 })
      expect(mockPost).toHaveBeenCalledWith(
        '/x/web-interface/archive/like/triple',
        { aid: '170001', bvid: '' },
        'cookie',
      )
    })

    it('使用 bvid 三连', async () => {
      await tripleVideo(mockClient, { bvid: 'BV1xx' })
      expect(mockPost).toHaveBeenCalledWith(
        '/x/web-interface/archive/like/triple',
        { aid: '', bvid: 'BV1xx' },
        'cookie',
      )
    })
  })
})
