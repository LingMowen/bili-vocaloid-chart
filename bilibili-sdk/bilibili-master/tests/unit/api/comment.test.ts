/**
 * Comment API 单元测试
 */
import { describe, expect, it, vi, afterEach } from 'vitest'

import {
  getComments,
  getCommentReplies,
  sendComment,
  deleteComment,
  likeComment,
} from '../../../src/api'
import type { BiliClient } from '../../../src/transport'

const mockGet = vi.fn()
const mockPost = vi.fn()
const mockClient = { get: mockGet, post: mockPost } as unknown as BiliClient

describe('comment', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getComments', () => {
    it('必需参数 oid + type', async () => {
      await getComments(mockClient, { oid: 123, type: 1 })
      expect(mockGet).toHaveBeenCalledWith(
        '/x/v2/reply/wbi/main',
        expect.objectContaining({
          oid: '123',
          type: '1',
          mode: '3',
        }),
        'wbi',
      )
    })

    it('包含 JSON 序列化的 pagination_str', async () => {
      await getComments(mockClient, { oid: 123, type: 1 })
      const args = vi.mocked(mockGet).mock.calls[0][1] as Record<string, string>
      expect(args.pagination_str).toBeTruthy()
      const parsed = JSON.parse(args.pagination_str)
      expect(parsed.offset).toContain('"pn":1')
    })

    it('自定义 page 和 sort', async () => {
      await getComments(mockClient, { oid: 123, type: 1, page: 3, sort: 3 })
      const args = vi.mocked(mockGet).mock.calls[0][1] as Record<string, string>
      const parsed = JSON.parse(args.pagination_str)
      expect(parsed.offset).toContain('"pn":3')
    })
  })

  describe('getCommentReplies', () => {
    it('必需参数 oid + type + root', async () => {
      await getCommentReplies(mockClient, { oid: 123, type: 1, root: 456 })
      expect(mockGet).toHaveBeenCalledWith(
        '/x/v2/reply/reply',
        expect.objectContaining({
          oid: '123',
          type: '1',
          root: '456',
        }),
        'cookie',
      )
    })
  })

  describe('sendComment', () => {
    it('必需参数 oid + type + message', async () => {
      await sendComment(mockClient, { oid: 123, type: 1, message: 'hello' })
      expect(mockPost).toHaveBeenCalledWith(
        '/x/v2/reply/add',
        { oid: '123', type: '1', message: 'hello', root: '', parent: '', plat: '1' },
        'cookie',
      )
    })

    it('带 root 和 parent', async () => {
      await sendComment(mockClient, { oid: 123, type: 1, message: 'reply', root: 456, parent: 789 })
      expect(mockPost).toHaveBeenCalledWith(
        '/x/v2/reply/add',
        { oid: '123', type: '1', message: 'reply', root: '456', parent: '789', plat: '1' },
        'cookie',
      )
    })
  })

  describe('deleteComment', () => {
    it('传递 oid + type + rpid', async () => {
      await deleteComment(mockClient, { oid: 123, type: 1, rpid: 456 })
      expect(mockPost).toHaveBeenCalledWith(
        '/x/v2/reply/del',
        { oid: '123', type: '1', rpid: '456' },
        'cookie',
      )
    })
  })

  describe('likeComment', () => {
    it('点赞 action=1', async () => {
      await likeComment(mockClient, { oid: 123, type: 1, rpid: 456, like: true })
      expect(mockPost).toHaveBeenCalledWith(
        '/x/v2/reply/action',
        { oid: '123', type: '1', rpid: '456', action: '1' },
        'cookie',
      )
    })

    it('取消点赞 action=0', async () => {
      await likeComment(mockClient, { oid: 123, type: 1, rpid: 456, like: false })
      expect(mockPost).toHaveBeenCalledWith(
        '/x/v2/reply/action',
        { oid: '123', type: '1', rpid: '456', action: '0' },
        'cookie',
      )
    })
  })
})
