/**
 * 消息中心 API
 */

import type { BiliClient } from '../../transport'
import type { BiliApiResponse } from '../../types'

/** 获取私信会话列表 */
export async function getSessions(
  client: BiliClient,
  sessionType: 1 | 2 | 3 | 4 = 4,
): Promise<BiliApiResponse> {
  return client.get(
    'https://api.vc.bilibili.com/session_svr/v1/session_svr/get_sessions',
    {
      session_type: String(sessionType),
      group_fold: '1',
      unfollow_fold: '0',
      sort_rule: '2',
      build: '0',
      mobi_app: 'web',
    },
    'cookie',
  )
}

/** 获取指定用户的私信 */
export async function fetchSessions(
  client: BiliClient,
  talkerId: number,
  sessionType: 1 | 2 = 1,
  beginSeqno?: number,
): Promise<BiliApiResponse> {
  return client.get(
    'https://api.vc.bilibili.com/svr_sync/v1/svr_sync/fetch_session_msgs',
    {
      talker_id: String(talkerId),
      session_type: String(sessionType),
      begin_seqno: String(beginSeqno ?? 0),
    },
    'cookie',
  )
}

/** 获取新消息 */
export async function getNewSessions(
  client: BiliClient,
  beginTs?: number,
): Promise<BiliApiResponse> {
  return client.get(
    'https://api.vc.bilibili.com/session_svr/v1/session_svr/new_sessions',
    {
      begin_ts: String(beginTs ?? Math.floor(Date.now() / 1000)),
    },
    'cookie',
  )
}

/** 获取未读消息数 */
export async function getUnreadCount(client: BiliClient): Promise<BiliApiResponse> {
  return client.get('/x/msgfeed/unread', {}, 'cookie')
}

/** 获取点赞通知 */
export async function getLikeNotifications(client: BiliClient): Promise<BiliApiResponse> {
  return client.get('/x/msgfeed/like', {}, 'cookie')
}

/** 获取回复通知 */
export async function getReplyNotifications(client: BiliClient): Promise<BiliApiResponse> {
  return client.get('/x/msgfeed/reply', {}, 'cookie')
}
