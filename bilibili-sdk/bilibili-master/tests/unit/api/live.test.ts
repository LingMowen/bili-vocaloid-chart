/**
 * Live API 单元测试
 */
import { describe, expect, it, vi, afterEach } from 'vitest'

import { getLiveRoomInfo, getLiveStreamUrl, getLiveAreaList } from '../../../src/api'
import type { BiliClient } from '../../../src/transport'

const mockGet = vi.fn()
const mockClient = { get: mockGet, post: vi.fn() } as unknown as BiliClient

describe('live', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getLiveRoomInfo', () => {
    it('传递 room_id', async () => {
      await getLiveRoomInfo(mockClient, { roomId: 12345 })
      expect(mockGet).toHaveBeenCalledWith(
        'https://api.live.bilibili.com/xlive/web-room/v1/index/getInfoByRoom',
        { room_id: '12345' },
        'cookie',
      )
    })
  })

  describe('getLiveStreamUrl', () => {
    it('必需参数 roomId', async () => {
      await getLiveStreamUrl(mockClient, { roomId: 12345 })
      expect(mockGet).toHaveBeenCalledWith(
        'https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo',
        { room_id: '12345', qn: '10000', platform: 'web' },
        'cookie',
      )
    })

    it('自定义 qn 和 platform', async () => {
      await getLiveStreamUrl(mockClient, { roomId: 12345, qn: 4000, platform: 'h5' })
      expect(mockGet).toHaveBeenCalledWith(
        'https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo',
        { room_id: '12345', qn: '4000', platform: 'h5' },
        'cookie',
      )
    })
  })

  describe('getLiveAreaList', () => {
    it('无参数', async () => {
      await getLiveAreaList(mockClient)
      expect(mockGet).toHaveBeenCalledWith('/xlive/web-interface/v1/index/getAreaList', {}, 'none')
    })

    it('带 parentId', async () => {
      await getLiveAreaList(mockClient, { parentId: 1 })
      expect(mockGet).toHaveBeenCalledWith(
        '/xlive/web-interface/v1/index/getAreaList',
        { parent_id: '1' },
        'none',
      )
    })
  })
})
