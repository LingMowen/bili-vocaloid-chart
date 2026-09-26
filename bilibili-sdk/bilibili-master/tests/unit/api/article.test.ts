/**
 * Article API 单元测试
 */
import { describe, expect, it, vi, afterEach } from 'vitest'

import { getArticleInfo, getArticlesByUser, getArticleCategories } from '../../../src/api'
import type { BiliClient } from '../../../src/transport'

const mockGet = vi.fn()
const mockClient = { get: mockGet, post: vi.fn() } as unknown as BiliClient

describe('article', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getArticleInfo', () => {
    it('传递 id', async () => {
      await getArticleInfo(mockClient, { id: 12345 })
      expect(mockGet).toHaveBeenCalledWith('/x/article/viewinfo', { id: '12345' }, 'cookie')
    })
  })

  describe('getArticlesByUser', () => {
    it('必需参数 mid', async () => {
      await getArticlesByUser(mockClient, { mid: 123456 })
      expect(mockGet).toHaveBeenCalledWith(
        '/x/space/wbi/article',
        { mid: '123456', pn: '1', ps: '12' },
        'wbi',
      )
    })

    it('自定义分页', async () => {
      await getArticlesByUser(mockClient, { mid: 123456, page: 3, pageSize: 20 })
      expect(mockGet).toHaveBeenCalledWith(
        '/x/space/wbi/article',
        { mid: '123456', pn: '3', ps: '20' },
        'wbi',
      )
    })
  })

  describe('getArticleCategories', () => {
    it('无参数', async () => {
      await getArticleCategories(mockClient)
      expect(mockGet).toHaveBeenCalledWith('/x/article/category/list', {}, 'none')
    })
  })
})
