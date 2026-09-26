/**
 * Bangumi API 集成测试
 */
import { describe, expect } from 'vitest'

import {
  getBangumiInfo,
  getBangumiTimeline,
  getBangumiSeasonIndex,
  getBangumiRecommend,
} from '../../src/api'

import {
  createAnonymousClient,
  createCookieClient,
  describeIf,
  expectApiSuccess,
} from './helpers.js'

const client = createAnonymousClient()
const authed = createCookieClient()

describe('Bangumi API — 公开数据', () => {
  it('getBangumiTimeline 返回番剧时间表', async () => {
    const res = await expectApiSuccess(() => getBangumiTimeline(client))
    if (!res) return
    expect(res.code).toBe(0)
    expect(res.data).toBeDefined()
  })

  it('getBangumiRecommend 返回推荐', async () => {
    const res = await expectApiSuccess(() => getBangumiRecommend(client))
    if (!res) return
    expect(res.code).toBe(0)
  })
})

describeIf('BILIBILI_SESSDATA')('Bangumi API — 需登录', () => {
  const testSeasonId = Number(process.env.BILIBILI_TEST_SEASON_ID) || 0

  it('getBangumiInfo 返回番剧信息', async () => {
    if (!testSeasonId) return
    const res = await expectApiSuccess(() => getBangumiInfo(authed!, { seasonId: testSeasonId }))
    if (!res) return
    expect(res.code).toBe(0)
  })

  it('getBangumiSeasonIndex 返回分集', async () => {
    if (!testSeasonId) return
    const res = await expectApiSuccess(() =>
      getBangumiSeasonIndex(authed!, { seasonId: testSeasonId }),
    )
    if (!res) return
    expect(res.code).toBe(0)
  })
})
