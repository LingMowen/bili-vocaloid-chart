/**
 * Electric API 集成测试
 */
import { expect } from 'vitest'

import { getElectricList, getBCoinBalance } from '../../src/api'

import { createCookieClient, describeIf, expectApiSuccess } from './helpers.js'

const authed = createCookieClient()

describeIf('BILIBILI_SESSDATA')('Electric API', () => {
  it('getElectricList 返回充电列表', async () => {
    if (!authed) return
    const mid = Number(process.env.BILIBILI_DEDE_USER_ID) || 0
    if (!mid) return
    const res = await expectApiSuccess(() => getElectricList(authed, mid))
    if (!res) return
    expect(res.code).toBe(0)
  })

  it('getBCoinBalance 返回 B 币余额', async () => {
    if (!authed) return
    const res = await expectApiSuccess(() => getBCoinBalance(authed))
    if (!res) return
    expect(res.code).toBe(0)
  })
})
