/**
 * Emoji API 集成测试
 */
import { describe, expect } from 'vitest'

import { getEmojiList, getAllEmojis, getEmojiDetail, addEmojiPackage } from '../../src/api'

import {
  createAnonymousClient,
  createCookieClient,
  describeIf,
  expectApiSuccess,
} from './helpers.js'

const client = createAnonymousClient()
const authed = createCookieClient()

describe('Emoji API — 公开数据', () => {
  it('getEmojiList 返回表情包列表', async () => {
    const res = await expectApiSuccess(() => getEmojiList(client))
    if (!res) return
    expect(res).toBeDefined()
  })

  it('getEmojiDetail 返回表情包明细', async () => {
    const res = await expectApiSuccess(() => getEmojiDetail(client, [1, 2, 3]))
    if (!res) return
    expect(res).toBeDefined()
  })
})

describeIf('BILIBILI_SESSDATA')('Emoji API — 需登录', () => {
  it('getAllEmojis 返回所有表情包', async () => {
    if (!authed) return
    const res = await expectApiSuccess(() => getAllEmojis(authed))
    if (!res) return
    expect(res.code).toBe(0)
  })

  it('addEmojiPackage 添加表情包', async () => {
    if (!authed) return
    const res = await expectApiSuccess(() => addEmojiPackage(authed, 1))
    if (!res) return
    expect(res).toBeDefined()
  })
})
