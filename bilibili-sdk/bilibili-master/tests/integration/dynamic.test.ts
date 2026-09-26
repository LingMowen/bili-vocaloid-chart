/**
 * Dynamic API 集成测试
 */
import { expect } from 'vitest'

import { getDynamicList, getSpaceDynamic, getDynamicDetail } from '../../src/api'

import { createCookieClient, describeIf, expectApiSuccess } from './helpers.js'

const authed = createCookieClient()

describeIf('BILIBILI_SESSDATA')('Dynamic API — 需登录', () => {
  it('getDynamicList 返回动态列表', async () => {
    const res = await expectApiSuccess(() => getDynamicList(authed!))
    if (!res) return
    expect(res.code).toBe(0)
    expect(res.data).toBeDefined()
  })

  it('getDynamicDetail 返回动态详情', async () => {
    // 先获取列表找到第一条动态的 id
    const list = await expectApiSuccess(() => getDynamicList(authed!, { page: 1 }))
    if (!list?.data) return
    const items = (list.data as { items?: { id_str?: string }[] })?.items
    const firstId = items?.[0]?.id_str
    if (!firstId) return

    const res = await expectApiSuccess(() => getDynamicDetail(authed!, firstId))
    if (!res) return
    expect(res.code).toBe(0)
  })
})

// getSpaceDynamic 需要已知用户的 hostUid，没有环境变量时跳过
describeIf('BILIBILI_TEST_USER_MID')('Dynamic API — 用户空间', () => {
  const uid = Number(process.env.BILIBILI_TEST_USER_MID)

  it('getSpaceDynamic 返回用户动态', async () => {
    if (!authed) return
    const res = await expectApiSuccess(() => getSpaceDynamic(authed, { hostUid: uid }))
    if (!res) return
    expect(res.code).toBe(0)
  })
})
