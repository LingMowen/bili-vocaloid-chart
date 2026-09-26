/**
 * Search API 单元测试
 */
import { describe, expect, it, vi, afterEach } from 'vitest'

import { search, searchSuggest, getHotSearch } from '../../../src/api'
import type { BiliClient } from '../../../src/transport'

const mockGet = vi.fn()
const mockClient = { get: mockGet, post: vi.fn() } as unknown as BiliClient

describe('search', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('search', () => {
    it('必需参数 keyword', async () => {
      await search(mockClient, { keyword: 'test' })
      expect(mockGet).toHaveBeenCalledWith(
        '/x/web-interface/wbi/search/all/v2',
        { keyword: 'test', page: '1', pagesize: '20' },
        'wbi',
      )
    })

    it('可选参数', async () => {
      await search(mockClient, {
        keyword: 'bilibili',
        page: 2,
        pageSize: 50,
        order: 'click',
        type: 1,
        duration: 4,
        tids: 123,
      })
      expect(mockGet).toHaveBeenCalledWith(
        '/x/web-interface/wbi/search/all/v2',
        expect.objectContaining({
          keyword: 'bilibili',
          page: '2',
          pagesize: '50',
          order: 'click',
          search_type: '1',
          duration: '4',
          tids: '123',
        }),
        'wbi',
      )
    })
  })

  describe('searchSuggest', () => {
    it('传递 term', async () => {
      await searchSuggest(mockClient, { term: 'bili' })
      expect(mockGet).toHaveBeenCalledWith(
        '/x/web-interface/wbi/search/default',
        { term: 'bili' },
        'wbi',
      )
    })
  })

  describe('getHotSearch', () => {
    it('无参数', async () => {
      await getHotSearch(mockClient)
      expect(mockGet).toHaveBeenCalledWith('/x/web-interface/wbi/search/square', {}, 'wbi')
    })
  })
})
