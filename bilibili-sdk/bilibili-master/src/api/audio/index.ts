/**
 * 音频 API
 */

import type { BiliClient } from '../../transport'
import type { BiliApiResponse } from '../../types'

/** 获取音频信息 */
export async function getAudioInfo(client: BiliClient, sid: number): Promise<BiliApiResponse> {
  return client.get('https://www.bilibili.com/audio/music-service-c/web/song/info', {
    sid: String(sid),
  })
}

/** 获取音频列表 */
export async function getAudioList(
  client: BiliClient,
  params: {
    type?: number
    genre?: string
    lang?: string
    keyword?: string
    page?: number
    pageSize?: number
  } = {},
): Promise<BiliApiResponse> {
  return client.get('https://www.bilibili.com/audio/music-service-c/web/song/list', {
    type: String(params.type ?? 1),
    genre: params.genre ?? '',
    lang: params.lang ?? '',
    keyword: params.keyword ?? '',
    pn: String(params.page ?? 1),
    ps: String(params.pageSize ?? 30),
  })
}

/** 获取音频下载链接 */
export async function getAudioDownloadUrl(
  client: BiliClient,
  sid: number,
): Promise<BiliApiResponse> {
  return client.get('https://www.bilibili.com/audio/music-service-c/web/url', {
    sid: String(sid),
    privilege: '2',
    quality: '2',
  })
}

/** 获取歌单信息 */
export async function getAudioMenuInfo(client: BiliClient, sid: number): Promise<BiliApiResponse> {
  return client.get('https://www.bilibili.com/audio/music-service-c/web/menu/info', {
    sid: String(sid),
  })
}

/** 获取首页音频推荐 */
export async function getAudioHomepageRecommend(client: BiliClient): Promise<BiliApiResponse> {
  return client.get('/x/web-show/res/locs', {
    pf: '0',
    ids: '3715,3721,3727,3729,3737,3739,3745,3747,3749,3751,3756',
  })
}
