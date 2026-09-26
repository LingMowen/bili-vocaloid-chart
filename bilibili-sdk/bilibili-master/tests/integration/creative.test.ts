/**
 * Creative API 集成测试
 */
import { expect } from 'vitest'

import {
  getCreativeCompare,
  getCreativeGraph,
  getCreativeNum,
  getCreativeFanOverview,
} from '../../src/api'

import { createCookieClient, describeIf, expectApiSuccess } from './helpers.js'

const authed = createCookieClient()

describeIf('BILIBILI_SESSDATA')('Creative API', () => {
  it('getCreativeCompare 返回对比数据', async () => {
    if (!authed) return
    const res = await expectApiSuccess(() => getCreativeCompare(authed))
    if (!res) return
    expect(res.code).toBe(0)
  })

  it('getCreativeGraph 返回图表数据', async () => {
    if (!authed) return
    const res = await expectApiSuccess(() => getCreativeGraph(authed, 7, 'play'))
    if (!res) return
    expect(res.code).toBe(0)
  })

  it('getCreativeNum 返回统计数字', async () => {
    if (!authed) return
    const res = await expectApiSuccess(() => getCreativeNum(authed, 7))
    if (!res) return
    expect(res.code).toBe(0)
  })

  it('getCreativeFanOverview 返回粉丝数据', async () => {
    if (!authed) return
    const res = await expectApiSuccess(() => getCreativeFanOverview(authed, 7))
    if (!res) return
    expect(res.code).toBe(0)
  })
})
