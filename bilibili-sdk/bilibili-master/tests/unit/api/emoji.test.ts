/**
 * Emoji (表情包) API 单元测试
 */
import { describe, expect, it, vi, afterEach } from 'vitest'

import { getEmojiList, getAllEmojis, getEmojiDetail, addEmojiPackage } from '../../../src/api'
import type { BiliClient } from '../../../src/transport'

const mockGet = vi.fn()
const mockPost = vi.fn()
const mockClient = { get: mockGet, post: mockPost } as unknown as BiliClient

describe('emoji', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getEmojiList', () => {
    it('默认 business=reply', async () => {
      await getEmojiList(mockClient)
      expect(mockGet).toHaveBeenCalledWith('/x/emote/user/panel/web', { business: 'reply' })
    })

    it('指定 business=dynamic', async () => {
      await getEmojiList(mockClient, 'dynamic')
      expect(mockGet).toHaveBeenCalledWith('/x/emote/user/panel/web', { business: 'dynamic' })
    })
  })

  describe('getAllEmojis', () => {
    it('GET cookie 鉴权', async () => {
      await getAllEmojis(mockClient)
      expect(mockGet).toHaveBeenCalledWith(
        '/x/emote/setting/panel',
        { business: 'reply' },
        'cookie',
      )
    })
  })

  describe('getEmojiDetail', () => {
    it('单个 id', async () => {
      await getEmojiDetail(mockClient, 1)
      expect(mockGet).toHaveBeenCalledWith('/x/emote/package', { business: 'reply', ids: '1' })
    })

    it('多个 id 的数组', async () => {
      await getEmojiDetail(mockClient, [1, 2, 3])
      expect(mockGet).toHaveBeenCalledWith('/x/emote/package', { business: 'reply', ids: '1,2,3' })
    })

    it('指定 business', async () => {
      await getEmojiDetail(mockClient, 1, 'dynamic')
      expect(mockGet).toHaveBeenCalledWith('/x/emote/package', { business: 'dynamic', ids: '1' })
    })
  })

  describe('addEmojiPackage', () => {
    it('POST cookie 鉴权', async () => {
      await addEmojiPackage(mockClient, 123)
      expect(mockPost).toHaveBeenCalledWith(
        '/x/emote/package/add',
        { package_id: '123', business: 'reply' },
        'cookie',
      )
    })
  })
})
