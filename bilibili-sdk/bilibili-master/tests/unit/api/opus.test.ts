/**
 * Opus (图文动态) API 单元测试
 */
import { describe, expect, it, vi, afterEach } from 'vitest'

import { getOpusDetail } from '../../../src/api'
import type { BiliClient } from '../../../src/transport'

const mockGet = vi.fn()
const mockClient = { get: mockGet, post: vi.fn() } as unknown as BiliClient

describe('opus', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getOpusDetail', () => {
    it('传递 id', async () => {
      await getOpusDetail(mockClient, '12345')
      expect(mockGet).toHaveBeenCalledWith('/x/polymer/web-dynamic/v1/opus/detail', {
        timezone_offset: '-480',
        id: '12345',
      })
    })
  })
})
