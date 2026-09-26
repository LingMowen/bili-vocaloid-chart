/**
 * Fav API 集成测试
 */
import { describe, expect } from 'vitest'

import { getFavList, getFavInfo, getFavContent, addFavVideo } from '../../src/api'

import {
  createAnonymousClient,
  createCookieClient,
  TEST_VIDEO_AID,
  describeIf,
  expectApiSuccess,
} from './helpers.js'

const client = createAnonymousClient()
const authed = createCookieClient()

// getFavInfo 和 getFavContent 不需要鉴权
describe('Fav API — 公开数据', () => {
  it('getFavInfo 返回收藏夹信息', async () => {
    const res = await expectApiSuccess(() => getFavInfo(client, 12345))
    if (!res) return
    expect(res).toBeDefined()
  })

  it('getFavContent 返回收藏夹内容', async () => {
    const res = await expectApiSuccess(() => getFavContent(client, { mediaId: 12345 }))
    if (!res) return
    expect(res).toBeDefined()
  })
})

describeIf('BILIBILI_SESSDATA')('Fav API — 需登录', () => {
  const mid = Number(process.env.BILIBILI_DEDE_USER_ID) || 0

  it('getFavList 返回收藏夹列表', async () => {
    if (!mid || !authed) return
    const res = await expectApiSuccess(() => getFavList(authed, mid))
    if (!res) return
    expect(res.code).toBe(0)
  })

  it('addFavVideo 操作收藏', async () => {
    if (!mid || !authed) return
    // 先获取收藏夹列表找到第一个 media_id
    const list = await getFavList(authed, mid)
    const folders = (list.data as { media_id?: number; id?: number }[]) || []
    const mediaId = folders[0]?.media_id ?? folders[0]?.id
    if (!mediaId) return

    // 收藏 → 取消收藏
    const addRes = await addFavVideo(authed, TEST_VIDEO_AID, [mediaId], [])
    expect(addRes.code).toBe(0)

    const delRes = await addFavVideo(authed, TEST_VIDEO_AID, [], [mediaId])
    expect(delRes.code).toBe(0)
  })
})
