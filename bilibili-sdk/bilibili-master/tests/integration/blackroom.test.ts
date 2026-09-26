/**
 * Blackroom API 集成测试
 */
import { describe, expect } from 'vitest'

import { getBlockedList, getBlockedDetail, getJuryCase, juryVote } from '../../src/api'

import {
  createAnonymousClient,
  createCookieClient,
  describeIf,
  expectApiSuccess,
} from './helpers.js'

const client = createAnonymousClient()
const authed = createCookieClient()

describe('Blackroom API — 公开数据', () => {
  it('getBlockedList 返回小黑屋列表', async () => {
    const res = await expectApiSuccess(() => getBlockedList(client))
    if (!res) return
    expect(res).toBeDefined()
  })

  it('getBlockedDetail 返回小黑屋详情', async () => {
    const res = await expectApiSuccess(() => getBlockedDetail(client, 'test'))
    if (!res) return
    expect(res).toBeDefined()
  })
})

describeIf('BILIBILI_SESSDATA')('Blackroom API — 需登录', () => {
  it('getJuryCase 返回案件详情', async () => {
    if (!authed) return
    const res = await expectApiSuccess(() => getJuryCase(authed, 'test'))
    if (!res) return
    expect(res).toBeDefined()
  })

  it('juryVote 投票', async () => {
    if (!authed) return
    const res = await expectApiSuccess(() =>
      juryVote(authed, { caseId: 'test', vote: 0, content: 'test' }),
    )
    if (!res) return
    expect(res).toBeDefined()
  })
})
