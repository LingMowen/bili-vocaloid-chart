/**
 * 视频 API 集成测试
 *
 * 使用真实 B 站接口验证数据格式正确性。
 * 部分测试需要 .env 中的 Cookie 凭据（不需要时自动跳过）。
 */

import { describe, expect, it } from 'vitest'

import {
  getVideoStat,
  getVideoInfo,
  getVideoPages,
  getRelatedVideos,
  getVideoTags,
  getVideoSnapshot,
} from '../../src/api'

import {
  createAnonymousClient,
  createCookieClient,
  TEST_VIDEO_AID,
  TEST_VIDEO_BVID,
  describeIf,
  itIf,
  expectApiSuccess,
} from './helpers.js'

const client = createAnonymousClient()
const authedClient = createCookieClient()

describe('Video API — 公开数据', () => {
  it('getVideoStat 返回标准统计结构', async () => {
    const res = await expectApiSuccess(() => getVideoStat(client, { aid: TEST_VIDEO_AID }))
    if (!res) return // 网络不可达时跳过
    expect(res.code).toBe(0)
    expect(res.message).toBe('0')
    expect(res.data).toBeDefined()
    expect(res.data.view).toBeGreaterThanOrEqual(0)
    expect(res.data.danmaku).toBeGreaterThanOrEqual(0)
    expect(res.data.reply).toBeGreaterThanOrEqual(0)
    expect(res.data.favorite).toBeGreaterThanOrEqual(0)
    expect(res.data.coin).toBeGreaterThanOrEqual(0)
    expect(res.data.share).toBeGreaterThanOrEqual(0)
    expect(res.data.like).toBeGreaterThanOrEqual(0)
  })

  it('getVideoStat 支持 bvid 参数', async () => {
    const res = await expectApiSuccess(() => getVideoStat(client, { bvid: TEST_VIDEO_BVID }))
    if (!res) return
    expect(res.code).toBe(0)
    expect(res.data).toBeDefined()
  })

  it('getVideoPages 返回分 P 列表', async () => {
    const res = await expectApiSuccess(() => getVideoPages(client, { aid: TEST_VIDEO_AID }))
    if (!res) return
    expect(res.code).toBe(0)
    expect(Array.isArray(res.data)).toBe(true)
    if (res.data.length > 0) {
      const page = res.data[0]
      expect(page.cid).toBeGreaterThan(0)
      expect(page.page).toBeGreaterThan(0)
      expect(typeof page.part).toBe('string')
      expect(page.duration).toBeGreaterThan(0)
    }
  })

  it('getRelatedVideos 返回关联视频', async () => {
    const res = await expectApiSuccess(() => getRelatedVideos(client, { aid: TEST_VIDEO_AID }))
    if (!res) return
    expect(res.code).toBe(0)
    expect(Array.isArray(res.data)).toBe(true)
  })

  it('getVideoTags 返回视频标签', async () => {
    const res = await expectApiSuccess(() => getVideoTags(client, { aid: TEST_VIDEO_AID }))
    if (!res) return
    expect(res.code).toBe(0)
    expect(Array.isArray(res.data)).toBe(true)
  })

  it('getVideoSnapshot 返回视频快照', async () => {
    // 需要先获取视频 cid
    const pages = await getVideoPages(client, { aid: TEST_VIDEO_AID })
    const cid = (pages.data as { cid?: number }[])?.[0]?.cid
    if (!cid) return
    const res = await expectApiSuccess(() => getVideoSnapshot(client, { aid: TEST_VIDEO_AID, cid }))
    if (!res) return
    expect(res.code).toBe(0)
    expect((res.data as { image?: string[] }).image).toBeDefined()
  })
})

describeIf('BILIBILI_SESSDATA')('Video API — 需登录', () => {
  it('getVideoInfo 返回视频详细信息', async () => {
    const res = await getVideoInfo(authedClient!, { aid: TEST_VIDEO_AID })
    expect(res.code).toBe(0)
    expect(res.data).toBeDefined()
    expect(res.data.bvid).toBeTruthy()
    expect(res.data.aid).toBe(TEST_VIDEO_AID)
    expect(res.data.title).toBeTruthy()
    expect(res.data.desc).toBeTruthy()
    expect(res.data.duration).toBeGreaterThan(0)
    expect(Array.isArray(res.data.pages)).toBe(true)
    expect(res.data.stat).toBeDefined()
    expect(res.data.owner.mid).toBeGreaterThan(0)
  })
})

itIf('BILIBILI_SESSDATA')('getVideoInfo 不存在的视频返回错误', async () => {
  const res = await getVideoInfo(authedClient!, { aid: 999999999 })
  // 不存在的视频应返回非 0 code
  expect(res.code).not.toBe(0)
})
