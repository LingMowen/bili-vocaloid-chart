/**
 * History API 单元测试
 */
import { describe, expect, it, vi, afterEach } from 'vitest'

import { getHistory, getToViewList, addToView, removeToView } from '../../../src/api'
import type { BiliClient } from '../../../src/transport'

const mockGet = vi.fn()
const mockPost = vi.fn()
const mockClient = { get: mockGet, post: mockPost } as unknown as BiliClient

describe('history', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getHistory', () => {
    it('默认参数', async () => {
      await getHistory(mockClient)
      expect(mockGet).toHaveBeenCalledWith(
        '/x/web-interface/history/cursor',
        { pn: '1', ps: '20', type: 'archive' },
        'cookie',
      )
    })

    it('自定义参数', async () => {
      await getHistory(mockClient, { page: 3, pageSize: 50, type: 'live' })
      expect(mockGet).toHaveBeenCalledWith(
        '/x/web-interface/history/cursor',
        { pn: '3', ps: '50', type: 'live' },
        'cookie',
      )
    })
  })

  describe('getToViewList', () => {
    it('无参数', async () => {
      await getToViewList(mockClient)
      expect(mockGet).toHaveBeenCalledWith('/x/v2/history/toview', {}, 'cookie')
    })
  })

  describe('addToView', () => {
    it('传递 aid', async () => {
      await addToView(mockClient, 170001)
      expect(mockPost).toHaveBeenCalledWith('/x/v2/history/toview/add', { aid: '170001' }, 'cookie')
    })
  })

  describe('removeToView', () => {
    it('传递 aid 和 viewed=true', async () => {
      await removeToView(mockClient, 170001)
      expect(mockPost).toHaveBeenCalledWith(
        '/x/v2/history/toview/del',
        { aid: '170001', viewed: 'true' },
        'cookie',
      )
    })
  })
})
