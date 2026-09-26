/**
 * Comment API 集成测试
 *
 * 评论接口使用 wbi 签名，在匿名客户端下可能因缺少 wbi 签名而失败。
 */
import { expect } from 'vitest'

import {
  sendComment,
  deleteComment,
  likeComment,
  getComments,
  getCommentReplies,
} from '../../src/api'

import {
  createAnonymousClient,
  createCookieClient,
  describeIf,
  TEST_VIDEO_AID,
  expectApiSuccess,
} from './helpers.js'

const client = createAnonymousClient()
const authed = createCookieClient()

describeIf('BILIBILI_WBI_READY')('Comment API — 读', () => {
  it('getComments 返回视频评论', async () => {
    const res = await expectApiSuccess(() => getComments(client, { oid: TEST_VIDEO_AID, type: 1 }))
    if (!res) return
    expect(res.code).toBe(0)
  })

  it('getCommentReplies 返回评论回复', async () => {
    // 先获取评论列表找到第一条评论的 rpid
    const comments = await expectApiSuccess(() =>
      getComments(client, { oid: TEST_VIDEO_AID, type: 1 }),
    )
    if (!comments?.data) return
    const replies = (comments.data as { replies?: { rpid?: number }[] })?.replies
    const firstRpid = replies?.[0]?.rpid
    if (!firstRpid) return

    const res = await expectApiSuccess(() =>
      getCommentReplies(client, { oid: TEST_VIDEO_AID, type: 1, root: firstRpid }),
    )
    if (!res) return
    expect(res.code).toBe(0)
  })
})

describeIf('BILIBILI_SESSDATA')('Comment API — 写', () => {
  it('sendComment → deleteComment 生命周期', async () => {
    // 发送
    const sendRes = await sendComment(authed!, {
      oid: TEST_VIDEO_AID,
      type: 1,
      message: '集成测试评论，请忽略',
    })
    expect(sendRes.code).toBe(0)
    const rpid = (sendRes.data as { rpid?: number })?.rpid
    expect(rpid).toBeGreaterThan(0)

    // 点赞
    const likeRes = await likeComment(authed!, {
      oid: TEST_VIDEO_AID,
      type: 1,
      rpid: rpid!,
      like: true,
    })
    expect(likeRes.code).toBe(0)

    // 删除
    const delRes = await deleteComment(authed!, { oid: TEST_VIDEO_AID, type: 1, rpid: rpid! })
    expect(delRes.code).toBe(0)
  })
})
