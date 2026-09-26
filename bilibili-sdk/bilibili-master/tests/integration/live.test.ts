/**
 * Live API 集成测试
 */
import { describe, expect } from 'vitest'

import { getLiveRoomInfo, getLiveStreamUrl, getLiveAreaList } from '../../src/api'

import {
  createAnonymousClient,
  createCookieClient,
  describeIf,
  expectApiSuccess,
} from './helpers.js'

const client = createAnonymousClient()
const authed = createCookieClient()

describe('Live API — 公开数据', () => {
  it('getLiveAreaList 返回直播分区', async () => {
    const res = await expectApiSuccess(() => getLiveAreaList(client))
    if (!res) return
    expect(res.code).toBe(0)
    expect(res.data).toBeDefined()
  })
})

describeIf('BILIBILI_SESSDATA')('Live API — 需登录', () => {
  // 使用一个已知存在直播间的 room_id，可在 .env 中配置
  const roomId = Number(process.env.BILIBILI_TEST_ROOM_ID) || 6

  it('getLiveRoomInfo 返回直播间信息', async () => {
    const res = await expectApiSuccess(() => getLiveRoomInfo(authed!, { roomId }))
    if (!res) return
    expect(res.code).toBe(0)
  })

  it('getLiveStreamUrl 返回直播流地址', async () => {
    const res = await expectApiSuccess(() => getLiveStreamUrl(authed!, { roomId }))
    if (!res) return
    expect(res.code).toBe(0)
  })
})
