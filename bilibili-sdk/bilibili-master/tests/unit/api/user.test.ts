/**
 * User API 单元测试
 */
import { describe, expect, it, vi, afterEach } from 'vitest'

import {
  getUserInfo,
  getUserStat,
  getUserRelation,
  followUser,
  unfollowUser,
} from '../../../src/api'
import type { BiliClient } from '../../../src/transport'

const mockGet = vi.fn()
const mockPost = vi.fn()
const mockClient = {
  get: mockGet,
  post: mockPost,
} as unknown as BiliClient

describe('user / info', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getUserInfo', () => {
    it('传递 mid 参数', async () => {
      await getUserInfo(mockClient, { mid: 123456 })
      expect(mockGet).toHaveBeenCalledWith('/x/space/wbi/acc/info', { mid: '123456' }, 'wbi')
    })
  })

  describe('getUserStat', () => {
    it('传递 vmid 参数', async () => {
      await getUserStat(mockClient, { mid: 123456 })
      expect(mockGet).toHaveBeenCalledWith('/x/relation/stat', { vmid: '123456' }, 'cookie')
    })
  })

  describe('getUserRelation', () => {
    it('传递 mid 参数', async () => {
      await getUserRelation(mockClient, { mid: 123456 })
      expect(mockGet).toHaveBeenCalledWith('/x/space/wbi/acc/relation', { mid: '123456' }, 'wbi')
    })
  })
})

describe('user / action', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('followUser', () => {
    it('传递 fid 和 act=1', async () => {
      await followUser(mockClient, 123456)
      expect(mockPost).toHaveBeenCalledWith(
        '/x/relation/modify',
        { fid: '123456', act: '1' },
        'cookie',
      )
    })
  })

  describe('unfollowUser', () => {
    it('传递 fid 和 act=2', async () => {
      await unfollowUser(mockClient, 789012)
      expect(mockPost).toHaveBeenCalledWith(
        '/x/relation/modify',
        { fid: '789012', act: '2' },
        'cookie',
      )
    })
  })
})
