/**
 * Dynamic API 单元测试
 */
import { describe, expect, it, vi, afterEach } from 'vitest'

import { getDynamicList, getSpaceDynamic, getDynamicDetail, likeDynamic } from '../../../src/api'
import type { BiliClient } from '../../../src/transport'

const mockGet = vi.fn()
const mockPost = vi.fn()
const mockClient = { get: mockGet, post: mockPost } as unknown as BiliClient

describe('dynamic', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getDynamicList', () => {
    it('默认参数', async () => {
      await getDynamicList(mockClient)
      expect(mockGet).toHaveBeenCalledWith(
        '/x/polymer/web-dynamic/v1/feed/all',
        { page: '1', offset: '', platform: 'web' },
        'cookie',
      )
    })

    it('自定义参数', async () => {
      await getDynamicList(mockClient, { page: 3, offset: 'abc', platform: 'ios' })
      expect(mockGet).toHaveBeenCalledWith(
        '/x/polymer/web-dynamic/v1/feed/all',
        { page: '3', offset: 'abc', platform: 'ios' },
        'cookie',
      )
    })
  })

  describe('getSpaceDynamic', () => {
    it('必需参数 hostUid', async () => {
      await getSpaceDynamic(mockClient, { hostUid: 123456 })
      expect(mockGet).toHaveBeenCalledWith(
        '/x/polymer/web-dynamic/v1/feed/space',
        { host_uid: '123456', offset: '' },
        'cookie',
      )
    })

    it('带 offset', async () => {
      await getSpaceDynamic(mockClient, { hostUid: 123456, offset: 'abc' })
      expect(mockGet).toHaveBeenCalledWith(
        '/x/polymer/web-dynamic/v1/feed/space',
        { host_uid: '123456', offset: 'abc' },
        'cookie',
      )
    })
  })

  describe('getDynamicDetail', () => {
    it('传递 dynamicId', async () => {
      await getDynamicDetail(mockClient, '12345')
      expect(mockGet).toHaveBeenCalledWith(
        '/x/polymer/web-dynamic/v1/detail',
        { id: '12345' },
        'cookie',
      )
    })
  })

  describe('likeDynamic', () => {
    it('点赞', async () => {
      await likeDynamic(mockClient, '12345')
      expect(mockPost).toHaveBeenCalledWith(
        '/x/dynamic/feed/dyn/thumb',
        { dyn_id_str: '12345', up: '1' },
        'cookie',
      )
    })

    it('取消点赞', async () => {
      await likeDynamic(mockClient, '12345', true)
      expect(mockPost).toHaveBeenCalledWith(
        '/x/dynamic/feed/dyn/thumb',
        { dyn_id_str: '12345', up: '2' },
        'cookie',
      )
    })
  })
})
