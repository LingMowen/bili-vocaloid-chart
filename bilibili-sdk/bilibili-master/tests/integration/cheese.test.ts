/**
 * Cheese API 集成测试
 */
import { describe, expect } from 'vitest'

import { getCheeseMeta, getCheeseList, getCheesePlayUrl } from '../../src/api'

import { createAnonymousClient, expectApiSuccess } from './helpers.js'

const client = createAnonymousClient()

// 测试用课程：哔哩哔哩课堂《一门给年轻人的恋爱成长课》
// 首页 https://www.bilibili.com/cheese/play/ss1512
const TEST_SEASON_ID = 1512
// 该课程第一集（先导篇）的播放参数
const TEST_EPISODE = { aid: 567223354, cid: 1017077421, epId: 69178 }

describe('Cheese API — 公开数据', () => {
  it('getCheeseMeta 返回课程元数据', async () => {
    const res = await expectApiSuccess(() => getCheeseMeta(client, { seasonId: TEST_SEASON_ID }))
    if (!res) return
    expect(res.code).toBe(0)
    expect(res.data).toBeDefined()
  })

  it('getCheeseList 返回课程视频列表', async () => {
    const res = await expectApiSuccess(() => getCheeseList(client, TEST_SEASON_ID))
    if (!res) return
    expect(res.code).toBe(0)
    expect(res.data).toBeDefined()
  })

  it('getCheesePlayUrl 返回播放地址', async () => {
    const res = await expectApiSuccess(() => getCheesePlayUrl(client, TEST_EPISODE))
    if (!res) return
    expect(res.code).toBe(0)
    expect(res.data).toBeDefined()
  })
})
