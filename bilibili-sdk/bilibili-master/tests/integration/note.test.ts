/**
 * Note API 集成测试
 */
import { describe, expect } from 'vitest'

import { getNoteDetail, getVideoPublicNotes } from '../../src/api'

import {
  createAnonymousClient,
  createCookieClient,
  TEST_VIDEO_AID,
  describeIf,
  expectApiSuccess,
} from './helpers.js'

const client = createAnonymousClient()
const authed = createCookieClient()

describe('Note API — 公开数据', () => {
  it('getNoteDetail 返回笔记详情', async () => {
    const res = await expectApiSuccess(() => getNoteDetail(client, 12345))
    if (!res) return
    expect(res).toBeDefined()
  })

  it('getVideoPublicNotes 返回视频公开笔记列表', async () => {
    const res = await expectApiSuccess(() => getVideoPublicNotes(client, TEST_VIDEO_AID, 1))
    if (!res) return
    expect(res).toBeDefined()
  })
})

describeIf('BILIBILI_SESSDATA')('Note API — 需登录', () => {
  it('getPrivateNoteDetail 返回私有笔记', async () => {
    if (!authed) return
    const res = await expectApiSuccess(() =>
      import('../../src/api/note').then((m) =>
        m.getPrivateNoteDetail(authed, { oid: TEST_VIDEO_AID, oidType: 1, noteId: 0 }),
      ),
    )
    if (!res) return
    expect(res).toBeDefined()
  })
})
