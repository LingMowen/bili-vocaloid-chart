/**
 * Message API 集成测试
 */
import { expect } from 'vitest'

import {
  getSessions,
  getUnreadCount,
  getLikeNotifications,
  getReplyNotifications,
} from '../../src/api'

import { createCookieClient, describeIf, expectApiSuccess } from './helpers.js'

const authed = createCookieClient()

describeIf('BILIBILI_SESSDATA')('Message API', () => {
  it('getUnreadCount 返回未读数', async () => {
    if (!authed) return
    const res = await expectApiSuccess(() => getUnreadCount(authed))
    if (!res) return
    expect(res.code).toBe(0)
  })

  it('getLikeNotifications 返回点赞通知', async () => {
    if (!authed) return
    const res = await expectApiSuccess(() => getLikeNotifications(authed))
    if (!res) return
    expect(res.code).toBe(0)
  })

  it('getReplyNotifications 返回回复通知', async () => {
    if (!authed) return
    const res = await expectApiSuccess(() => getReplyNotifications(authed))
    if (!res) return
    expect(res.code).toBe(0)
  })

  it('getSessions 返回私信会话列表', async () => {
    if (!authed) return
    const res = await expectApiSuccess(() => getSessions(authed))
    if (!res) return
    expect(res.code).toBe(0)
  })
})
