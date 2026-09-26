/**
 * Blackroom (小黑屋) API 单元测试
 */
import { describe, expect, it, vi, afterEach } from 'vitest'

import { getBlockedList, getBlockedDetail, getJuryCase, juryVote } from '../../../src/api'
import type { BiliClient } from '../../../src/transport'

const mockGet = vi.fn()
const mockPost = vi.fn()
const mockClient = { get: mockGet, post: mockPost } as unknown as BiliClient

describe('blackroom', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getBlockedList', () => {
    it('默认参数', async () => {
      await getBlockedList(mockClient)
      expect(mockGet).toHaveBeenCalledWith('/x/credit/blocked/list', { pn: '1' })
    })

    it('自定义参数', async () => {
      await getBlockedList(mockClient, { blockType: 1, originType: 2, page: 3 })
      expect(mockGet).toHaveBeenCalledWith('/x/credit/blocked/list', {
        pn: '3',
        btype: '1',
        otype: '2',
      })
    })
  })

  describe('getBlockedDetail', () => {
    it('传递 id', async () => {
      await getBlockedDetail(mockClient, 'case123')
      expect(mockGet).toHaveBeenCalledWith('/x/credit/blocked/info', { id: 'case123' })
    })
  })

  describe('getJuryCase', () => {
    it('传递 case_id', async () => {
      await getJuryCase(mockClient, 'case123')
      expect(mockGet).toHaveBeenCalledWith(
        '/x/credit/v2/jury/case/info',
        { case_id: 'case123' },
        'cookie',
      )
    })
  })

  describe('juryVote', () => {
    it('投票', async () => {
      await juryVote(mockClient, { caseId: 'case123', vote: 1, content: '违规' })
      expect(mockPost).toHaveBeenCalledWith(
        '/x/credit/v2/jury/vote',
        { case_id: 'case123', vote: '1', content: '违规', insiders: '0', anonymous: '0' },
        'cookie',
      )
    })

    it('带 insiders 和 anonymous', async () => {
      await juryVote(mockClient, {
        caseId: 'case123',
        vote: 2,
        content: '不违规',
        insiders: 1,
        anonymous: 1,
      })
      expect(mockPost).toHaveBeenCalledWith(
        '/x/credit/v2/jury/vote',
        { case_id: 'case123', vote: '2', content: '不违规', insiders: '1', anonymous: '1' },
        'cookie',
      )
    })
  })
})
