/**
 * Article API 集成测试
 */
import { describe, expect } from 'vitest'

import { getArticleInfo, getArticlesByUser, getArticleCategories } from '../../src/api'

import {
  createAnonymousClient,
  createCookieClient,
  describeIf,
  expectApiSuccess,
} from './helpers.js'

const client = createAnonymousClient()
const authed = createCookieClient()

describe('Article API — 公开数据', () => {
  it('getArticleCategories 返回文章分类', async () => {
    const res = await expectApiSuccess(() => getArticleCategories(client))
    if (!res) return
    expect(res.code).toBe(0)
    expect(Array.isArray(res.data)).toBe(true)
  })
})

describeIf('BILIBILI_SESSDATA')('Article API — 需登录', () => {
  const testArticleId = Number(process.env.BILIBILI_TEST_ARTICLE_ID) || 0

  it('getArticleInfo 返回文章信息', async () => {
    if (!testArticleId) return
    const res = await expectApiSuccess(() => getArticleInfo(authed!, { id: testArticleId }))
    if (!res) return
    expect(res.code).toBe(0)
  })

  it('getArticlesByUser 返回用户文章列表', async () => {
    const mid = Number(process.env.BILIBILI_DEDE_USER_ID) || 0
    if (!mid) return
    const res = await expectApiSuccess(() => getArticlesByUser(authed!, { mid }))
    if (!res) return
    expect(res.code).toBe(0)
  })
})
