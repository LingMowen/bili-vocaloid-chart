/**
 * Danmaku API 单元测试
 */
import { gzipSync } from 'node:zlib'

import protobuf from 'protobufjs'
import { describe, expect, it, vi, afterEach } from 'vitest'

import {
  getDanmaku,
  getHistoryDanmaku,
  getDanmakuView,
  getDanmakuSnapshot,
  sendDanmaku,
  likeDanmaku,
} from '../../../src/api'
import { decodeDanmaku } from '../../../src/api/danmaku/proto'
import { BiliApiError } from '../../../src/core'
import type { BiliClient } from '../../../src/transport'

const mockGet = vi.fn()
const mockPost = vi.fn()
const mockGetBinary = vi.fn().mockResolvedValue(new Uint8Array(0))
const mockClient = {
  get: mockGet,
  post: mockPost,
  getBinary: mockGetBinary,
} as unknown as BiliClient

describe('danmaku', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getDanmaku', () => {
    it('必需参数 oid + segmentIndex', async () => {
      await getDanmaku(mockClient, 123, 1)
      expect(mockGetBinary).toHaveBeenCalledWith(
        '/x/v2/dm/wbi/web/seg.so',
        { oid: '123', type: '1', segment_index: '1', pid: '' },
        'wbi',
      )
    })

    it('带 pid', async () => {
      await getDanmaku(mockClient, 123, 2, 456)
      expect(mockGetBinary).toHaveBeenCalledWith(
        '/x/v2/dm/wbi/web/seg.so',
        { oid: '123', type: '1', segment_index: '2', pid: '456' },
        'wbi',
      )
    })
  })

  describe('getHistoryDanmaku', () => {
    it('传递 oid + date', async () => {
      await getHistoryDanmaku(mockClient, 123, '2024-01-01')
      expect(mockGetBinary).toHaveBeenCalledWith(
        '/x/v2/dm/web/history/seg.so',
        { oid: '123', type: '1', date: '2024-01-01' },
        'cookie',
      )
    })
  })

  describe('getDanmakuView', () => {
    it('必需参数 oid', async () => {
      await getDanmakuView(mockClient, 123)
      expect(mockGet).toHaveBeenCalledWith('/x/v2/dm/web/view', { type: '1', oid: '123', pid: '' })
    })

    it('带 pid', async () => {
      await getDanmakuView(mockClient, 123, 456)
      expect(mockGet).toHaveBeenCalledWith('/x/v2/dm/web/view', {
        type: '1',
        oid: '123',
        pid: '456',
      })
    })
  })

  describe('getDanmakuSnapshot', () => {
    it('传递 aid', async () => {
      await getDanmakuSnapshot(mockClient, 170001)
      expect(mockGet).toHaveBeenCalledWith('/x/v2/dm/ajax', { aid: '170001' })
    })
  })

  describe('sendDanmaku', () => {
    it('必需参数 oid + bvid + msg + progress', async () => {
      await sendDanmaku(mockClient, { oid: 123, bvid: 'BV1xx', msg: 'hello', progress: 5000 })
      expect(mockPost).toHaveBeenCalledWith(
        '/x/v2/dm/post',
        {
          type: '1',
          oid: '123',
          bvid: 'BV1xx',
          msg: 'hello',
          progress: '5000',
          color: '16777215',
          fontsize: '25',
          pool: '0',
          mode: '1',
          plat: '1',
        },
        'cookie',
      )
    })

    it('自定义弹幕样式', async () => {
      await sendDanmaku(mockClient, {
        oid: 123,
        bvid: 'BV1xx',
        msg: 'hello',
        progress: 0,
        color: 0xff0000,
        mode: 4,
        fontSize: 36,
        pool: 1,
      })
      expect(mockPost).toHaveBeenCalledWith(
        '/x/v2/dm/post',
        expect.objectContaining({ color: '16711680', mode: '4', fontsize: '36', pool: '1' }),
        'cookie',
      )
    })
  })

  describe('likeDanmaku', () => {
    it('点赞', async () => {
      await likeDanmaku(mockClient, 12345, 678)
      expect(mockPost).toHaveBeenCalledWith(
        '/x/v2/dm/thumbup/add',
        { dmid: '12345', oid: '678', op: '1', platform: 'web_player' },
        'cookie',
      )
    })

    it('取消点赞', async () => {
      await likeDanmaku(mockClient, 12345, 678, true)
      expect(mockPost).toHaveBeenCalledWith(
        '/x/v2/dm/thumbup/add',
        { dmid: '12345', oid: '678', op: '2', platform: 'web_player' },
        'cookie',
      )
    })
  })

  describe('decodeDanmaku', () => {
    // 与 src/api/danmaku/proto.ts 字段编号一致
    const ENCODE_PROTO = `
syntax = "proto3";
message DanmakuElem {
  int64 id = 1;
  int32 progress = 2;
  int32 mode = 3;
  int32 fontsize = 4;
  uint32 color = 5;
  string midHash = 6;
  string content = 7;
  int64 ctime = 8;
  int32 weight = 9;
  string action = 10;
  int32 pool = 11;
  string idStr = 12;
  int32 attr = 13;
  string animation = 14;
}
message DmSegMobileReply {
  repeated DanmakuElem elems = 1;
}
`

    it('解码弹幕 protobuf 为数组', () => {
      const root = protobuf.parse(ENCODE_PROTO).root
      const type = root.lookupType('DmSegMobileReply')
      const payload = type.create({
        elems: [{ id: 123, progress: 1000, content: '测试弹幕', color: 16777215 }],
      })
      const bytes = type.encode(payload).finish()
      const elems = decodeDanmaku(bytes)
      expect(elems).toHaveLength(1)
      expect(elems[0].id).toBe(123)
      expect(elems[0].progress).toBe(1000)
      expect(elems[0].content).toBe('测试弹幕')
      expect(elems[0].color).toBe(16777215)
    })

    it('解码 gzip 压缩的弹幕 protobuf', () => {
      const root = protobuf.parse(ENCODE_PROTO).root
      const type = root.lookupType('DmSegMobileReply')
      const payload = type.create({
        elems: [{ id: 456, progress: 2000, content: 'gzip弹幕', mode: 1 }],
      })
      const bytes = type.encode(payload).finish()
      const elems = decodeDanmaku(gzipSync(bytes))
      expect(elems).toHaveLength(1)
      expect(elems[0].id).toBe(456)
      expect(elems[0].progress).toBe(2000)
      expect(elems[0].content).toBe('gzip弹幕')
      expect(elems[0].mode).toBe(1)
    })

    it('接受 ArrayBuffer 输入', () => {
      const root = protobuf.parse(ENCODE_PROTO).root
      const type = root.lookupType('DmSegMobileReply')
      const payload = type.create({
        elems: [{ id: 789, progress: 3000, content: 'arraybuffer' }],
      })
      const bytes = type.encode(payload).finish()
      const arrayBuffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer
      const elems = decodeDanmaku(arrayBuffer)
      expect(elems).toHaveLength(1)
      expect(elems[0].id).toBe(789)
      expect(elems[0].content).toBe('arraybuffer')
    })

    it('缺少 elems 字段时返回空数组', () => {
      const root = protobuf.parse(ENCODE_PROTO).root
      const type = root.lookupType('DmSegMobileReply')
      const bytes = type.encode(type.create({})).finish()
      expect(decodeDanmaku(bytes)).toEqual([])
    })

    it('空数据返回空数组', () => {
      expect(decodeDanmaku(new Uint8Array(0))).toEqual([])
    })

    it('JSON 错误响应抛出 BiliApiError', () => {
      const jsonBytes = new TextEncoder().encode('{"code":-101,"message":"账号未登录","ttl":1}')
      expect(() => decodeDanmaku(jsonBytes)).toThrow(BiliApiError)
    })
  })
})
