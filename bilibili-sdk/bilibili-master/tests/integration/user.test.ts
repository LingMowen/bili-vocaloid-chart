/**
 * User API 集成测试
 */
import { describe, expect } from 'vitest'

import { followUser, unfollowUser, getUserInfo, getUserStat, getUserRelation } from '../../src/api'

import {
  createAnonymousClient,
  createCookieClient,
  TEST_USER_MID,
  describeIf,
  expectApiSuccess,
} from './helpers.js'

const client = createAnonymousClient()
const authed = createCookieClient()

describe('User API — 公开数据', () => {
  const mid = TEST_USER_MID || 1

  it('getUserStat 返回状态数据', async () => {
    const res = await expectApiSuccess(() => getUserStat(client, { mid }))
    if (!res) return
    expect(res.code).toBe(0)
    expect(res.data).toBeDefined()
    expect(typeof res.data.following).toBe('number')
    expect(typeof res.data.follower).toBe('number')
  })
})

describeIf('BILIBILI_SESSDATA')('User API — 需登录', () => {
  const mid = TEST_USER_MID || Number(process.env.BILIBILI_DEDE_USER_ID) || 1

  it('getUserInfo 返回用户信息（wbi）', async () => {
    const res = await expectApiSuccess(() => getUserInfo(authed!, { mid }))
    if (!res) return
    expect(res.code).toBe(0)
    expect(res.data.mid).toBe(mid)
    expect(res.data.name).toBeTruthy()
  })

  it('getUserRelation 返回关系数据', async () => {
    const res = await expectApiSuccess(() => getUserRelation(authed!, { mid }))
    if (!res) return
    expect(res.code).toBe(0)
    expect(res.data).toBeDefined()
  })

  it('followUser / unfollowUser 操作', async () => {
    // 关注 → 取消关注
    const followRes = await followUser(authed!, mid)
    expect(followRes.code).toBe(0)

    const unfollowRes = await unfollowUser(authed!, mid)
    expect(unfollowRes.code).toBe(0)
  })
})
