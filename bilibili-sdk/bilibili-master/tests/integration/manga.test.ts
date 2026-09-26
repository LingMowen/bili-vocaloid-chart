/**
 * Manga API 集成测试
 *
 * 漫画接口使用 POST + cookie 鉴权，需要登录凭据。
 */
import { expect } from 'vitest'

import { getMangaDetail, getMangaDailyUpdate } from '../../src/api'

import { createCookieClient, describeIf, expectApiSuccess } from './helpers.js'

const authed = createCookieClient()

describeIf('BILIBILI_SESSDATA')('Manga API — 需登录', () => {
  it('getMangaDailyUpdate 返回每日更新', async () => {
    if (!authed) return
    const res = await expectApiSuccess(() => getMangaDailyUpdate(authed))
    if (!res) return
    expect(res.code).toBe(0)
  })

  it('getMangaDetail 返回漫画详情', async () => {
    if (!authed) return
    const comicId = Number(process.env.BILIBILI_TEST_COMIC_ID) || 0
    if (!comicId) return
    const res = await expectApiSuccess(() => getMangaDetail(authed, comicId))
    if (!res) return
    expect(res.code).toBe(0)
  })
})
