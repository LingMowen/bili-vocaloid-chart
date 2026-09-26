/**
 * Audio API 集成测试
 */
import { describe, expect } from 'vitest'

import {
  getAudioInfo,
  getAudioList,
  getAudioDownloadUrl,
  getAudioMenuInfo,
  getAudioHomepageRecommend,
} from '../../src/api'

import { createAnonymousClient, expectApiSuccess } from './helpers.js'

const client = createAnonymousClient()

describe('Audio API — 公开数据', () => {
  it('getAudioInfo 返回音频信息', async () => {
    const res = await expectApiSuccess(() => getAudioInfo(client, 12345))
    if (!res) return
    expect(res).toBeDefined()
  })

  it('getAudioList 返回音频列表', async () => {
    const res = await expectApiSuccess(() => getAudioList(client))
    if (!res) return
    expect(res).toBeDefined()
  })

  it('getAudioHomepageRecommend 返回推荐', async () => {
    const res = await expectApiSuccess(() => getAudioHomepageRecommend(client))
    if (!res) return
    expect(res).toBeDefined()
  })

  it('getAudioDownloadUrl 返回播放地址', async () => {
    // sid=10：有效音频（牵丝戏·小提琴版）
    const res = await expectApiSuccess(() => getAudioDownloadUrl(client, 10))
    if (!res) return
    expect(res.code).toBe(0)
    expect((res.data as { cdns?: string[] }).cdns).toBeDefined()
  })

  it('getAudioMenuInfo 返回歌单信息', async () => {
    // sid=200000：有效歌单（默认歌单）
    const res = await expectApiSuccess(() => getAudioMenuInfo(client, 200000))
    if (!res) return
    expect(res.code).toBe(0)
    expect(res.data).toBeDefined()
  })
})
