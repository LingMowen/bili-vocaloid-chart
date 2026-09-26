/**
 * History API 集成测试
 */
import { expect } from 'vitest'

import { getHistory, getToViewList, addToView, removeToView } from '../../src/api'

import { createCookieClient, TEST_VIDEO_AID, describeIf, expectApiSuccess } from './helpers.js'

const authed = createCookieClient()

describeIf('BILIBILI_SESSDATA')('History API — 需登录', () => {
  it('getHistory 返回观看历史', async () => {
    if (!authed) return
    const res = await expectApiSuccess(() => getHistory(authed))
    if (!res) return
    expect(res.code).toBe(0)
  })

  it('getToViewList 返回稍后再看列表', async () => {
    if (!authed) return
    const res = await expectApiSuccess(() => getToViewList(authed))
    if (!res) return
    expect(res.code).toBe(0)
  })

  it('addToView → removeToView 生命周期', async () => {
    if (!authed) return
    const addRes = await addToView(authed, TEST_VIDEO_AID)
    expect(addRes.code).toBe(0)

    const delRes = await removeToView(authed, TEST_VIDEO_AID)
    expect(delRes.code).toBe(0)
  })
})
