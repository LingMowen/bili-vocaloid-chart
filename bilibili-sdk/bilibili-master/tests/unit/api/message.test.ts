/**
 * Message (消息中心) API 单元测试
 */
import { describe, expect, it, vi, afterEach } from 'vitest'

import {
  getSessions,
  fetchSessions,
  getNewSessions,
  getUnreadCount,
  getLikeNotifications,
  getReplyNotifications,
} from '../../../src/api'
import type { BiliClient } from '../../../src/transport'

const mockGet = vi.fn()
const mockClient = { get: mockGet, post: vi.fn() } as unknown as BiliClient

describe('message', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getSessions', () => {
    it('默认 sessionType=4', async () => {
      await getSessions(mockClient)
      expect(mockGet).toHaveBeenCalledWith(
        'https://api.vc.bilibili.com/session_svr/v1/session_svr/get_sessions',
        {
          session_type: '4',
          group_fold: '1',
          unfollow_fold: '0',
          sort_rule: '2',
          build: '0',
          mobi_app: 'web',
        },
        'cookie',
      )
    })

    it('自定义 sessionType', async () => {
      await getSessions(mockClient, 1)
      expect(mockGet).toHaveBeenCalledWith(
        'https://api.vc.bilibili.com/session_svr/v1/session_svr/get_sessions',
        expect.objectContaining({ session_type: '1' }),
        'cookie',
      )
    })
  })

  describe('fetchSessions', () => {
    it('必需参数 talkerId + sessionType', async () => {
      await fetchSessions(mockClient, 123456, 1)
      expect(mockGet).toHaveBeenCalledWith(
        'https://api.vc.bilibili.com/svr_sync/v1/svr_sync/fetch_session_msgs',
        { talker_id: '123456', session_type: '1', begin_seqno: '0' },
        'cookie',
      )
    })

    it('带 beginSeqno', async () => {
      await fetchSessions(mockClient, 123456, 2, 100)
      expect(mockGet).toHaveBeenCalledWith(
        'https://api.vc.bilibili.com/svr_sync/v1/svr_sync/fetch_session_msgs',
        { talker_id: '123456', session_type: '2', begin_seqno: '100' },
        'cookie',
      )
    })
  })

  describe('getNewSessions', () => {
    it('默认使用当前时间戳', async () => {
      await getNewSessions(mockClient)
      const args = vi.mocked(mockGet).mock.calls[0][1] as Record<string, string>
      expect(args.begin_ts).toBeTruthy()
      expect(mockGet).toHaveBeenCalledWith(
        'https://api.vc.bilibili.com/session_svr/v1/session_svr/new_sessions',
        expect.any(Object),
        'cookie',
      )
    })

    it('自定义 beginTs', async () => {
      await getNewSessions(mockClient, 1234567890)
      expect(mockGet).toHaveBeenCalledWith(
        'https://api.vc.bilibili.com/session_svr/v1/session_svr/new_sessions',
        { begin_ts: '1234567890' },
        'cookie',
      )
    })
  })

  describe('getUnreadCount', () => {
    it('无参数 cookie 鉴权', async () => {
      await getUnreadCount(mockClient)
      expect(mockGet).toHaveBeenCalledWith('/x/msgfeed/unread', {}, 'cookie')
    })
  })

  describe('getLikeNotifications', () => {
    it('无参数 cookie 鉴权', async () => {
      await getLikeNotifications(mockClient)
      expect(mockGet).toHaveBeenCalledWith('/x/msgfeed/like', {}, 'cookie')
    })
  })

  describe('getReplyNotifications', () => {
    it('无参数 cookie 鉴权', async () => {
      await getReplyNotifications(mockClient)
      expect(mockGet).toHaveBeenCalledWith('/x/msgfeed/reply', {}, 'cookie')
    })
  })
})
