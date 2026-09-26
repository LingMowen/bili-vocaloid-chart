/**
 * Danmaku API 集成测试
 */
import { describe, expect } from 'vitest'

import { getDanmaku, getDanmakuView, getDanmakuSnapshot, sendDanmaku } from '../../src/api'

import {
  createAnonymousClient,
  createCookieClient,
  TEST_VIDEO_AID,
  describeIf,
  expectApiSuccess,
} from './helpers.js'

const client = createAnonymousClient()
const authed = createCookieClient()

describe('Danmaku API — 公开数据', () => {
  it('getDanmaku 返回弹幕数据', async () => {
    const res = await expectApiSuccess(() => getDanmaku(client, 12345, 1))
    if (!res) return
    expect(res.data).toBeDefined()
    expect(Array.isArray(res.data)).toBe(true)
  })

  it('getDanmakuView 返回弹幕配置', async () => {
    const res = await expectApiSuccess(() => getDanmakuView(client, 12345))
    if (!res) return
    expect(res).toBeDefined()
  })

  it('getDanmakuSnapshot 返回弹幕快照', async () => {
    const res = await expectApiSuccess(() => getDanmakuSnapshot(client, TEST_VIDEO_AID))
    if (!res) return
    expect(res.code).toBe(0)
    expect(Array.isArray(res.data)).toBe(true)
  })
})

describeIf('BILIBILI_SESSDATA')('Danmaku API — 需登录', () => {
  it('sendDanmaku 发送弹幕', async () => {
    // 需要知道视频的 oid (cid) 和 bvid
    const { getVideoPages } = await import('../../src/api/video')
    const pages = await getVideoPages(authed!, { aid: TEST_VIDEO_AID })
    const cid = (pages.data as { cid: number }[])?.[0]?.cid
    if (!cid) return

    const res = await sendDanmaku(authed!, {
      oid: cid,
      bvid: process.env.TEST_VIDEO_BVID ?? 'BV17x411w7KC',
      msg: '集成测试弹幕',
      progress: 1000,
    })
    expect(res.code).toBe(0)
  })
})
