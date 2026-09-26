/**
 * 漫画 API
 */

import type { BiliClient } from '../../transport'
import type { BiliApiResponse } from '../../types'

/** 获取漫画详情 */
export async function getMangaDetail(
  client: BiliClient,
  comicId: number,
): Promise<BiliApiResponse> {
  return client.post(
    'https://manga.bilibili.com/twirp/comic.v1.Comic/ComicDetail',
    {
      comic_id: String(comicId),
    },
    'cookie',
  )
}

/** 获取漫画章节信息 */
export async function getMangaEpisode(
  client: BiliClient,
  episodeId: number,
): Promise<BiliApiResponse> {
  return client.post(
    'https://manga.bilibili.com/twirp/comic.v1.Comic/GetEpisode',
    {
      id: String(episodeId),
    },
    'cookie',
  )
}

/** 获取漫画章节图片索引 */
export async function getMangaEpisodeImages(
  client: BiliClient,
  epId: number,
): Promise<BiliApiResponse> {
  return client.post(
    'https://manga.bilibili.com/twirp/comic.v1.Comic/GetImageIndex',
    {
      ep_id: String(epId),
    },
    'cookie',
  )
}

/** 获取漫画每日更新 */
export async function getMangaDailyUpdate(client: BiliClient): Promise<BiliApiResponse> {
  return client.post('https://manga.bilibili.com/twirp/comic.v1.Comic/GetDailyPush', {}, 'cookie')
}
