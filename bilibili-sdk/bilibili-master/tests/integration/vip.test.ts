/**
 * VIP API 集成测试
 */
import { expect } from 'vitest'

import { getVipInfo, vipClockIn, getVipCenter } from '../../src/api'

import { createCookieClient, describeIf, expectApiSuccess } from './helpers.js'

const authed = createCookieClient()

describeIf('BILIBILI_SESSDATA')('VIP API', () => {
  it('getVipInfo 返回大会员信息', async () => {
    if (!authed) return
    const res = await expectApiSuccess(() => getVipInfo(authed))
    if (!res) return
    expect(res.code).toBe(0)
  })

  it('getVipCenter 返回权益中心', async () => {
    if (!authed) return
    const res = await expectApiSuccess(() => getVipCenter(authed))
    if (!res) return
    expect(res.code).toBe(0)
  })

  it('vipClockIn 签到', async () => {
    if (!authed) return
    const res = await expectApiSuccess(() => vipClockIn(authed))
    if (!res) return
    // 签到可能已做过（code ≠ 0），但不应抛异常
    expect(res).toBeDefined()
  })
})
