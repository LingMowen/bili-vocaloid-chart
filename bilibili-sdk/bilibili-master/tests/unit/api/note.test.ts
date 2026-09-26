/**
 * Note (笔记) API 单元测试
 */
import { describe, expect, it, vi, afterEach } from 'vitest'

import { getNoteDetail, getPrivateNoteDetail, getVideoPublicNotes } from '../../../src/api'
import type { BiliClient } from '../../../src/transport'

const mockGet = vi.fn()
const mockClient = { get: mockGet, post: vi.fn() } as unknown as BiliClient

describe('note', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getNoteDetail', () => {
    it('传递 cvid', async () => {
      await getNoteDetail(mockClient, 12345)
      expect(mockGet).toHaveBeenCalledWith('/x/note/publish/info', { cvid: '12345' })
    })
  })

  describe('getPrivateNoteDetail', () => {
    it('传递 oid + oidType + noteId', async () => {
      await getPrivateNoteDetail(mockClient, { oid: 123, oidType: 1, noteId: 456 })
      expect(mockGet).toHaveBeenCalledWith(
        '/x/note/info',
        { oid: '123', oid_type: '1', note_id: '456' },
        'cookie',
      )
    })
  })

  describe('getVideoPublicNotes', () => {
    it('必需参数 oid + oidType', async () => {
      await getVideoPublicNotes(mockClient, 123, 1)
      expect(mockGet).toHaveBeenCalledWith('/x/note/publish/list/archive', {
        oid: '123',
        oid_type: '1',
        pn: '1',
        ps: '10',
      })
    })

    it('自定义分页', async () => {
      await getVideoPublicNotes(mockClient, 123, 1, 3, 20)
      expect(mockGet).toHaveBeenCalledWith('/x/note/publish/list/archive', {
        oid: '123',
        oid_type: '1',
        pn: '3',
        ps: '20',
      })
    })
  })
})
