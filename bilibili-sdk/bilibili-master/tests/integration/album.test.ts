/**
 * Album API 集成测试
 */
import { describe, expect } from 'vitest'

import { getAlbumInfo, getAlbumListByUser } from '../../src/api'

import { createAnonymousClient, expectApiSuccess } from './helpers.js'

const client = createAnonymousClient()

describe('Album API', () => {
  it('getAlbumInfo 返回相簿信息', async () => {
    const res = await expectApiSuccess(() => getAlbumInfo(client, 12345))
    if (!res) return
    expect(res).toBeDefined()
  })

  it('getAlbumListByUser 返回用户相簿列表', async () => {
    const res = await expectApiSuccess(() => getAlbumListByUser(client, 1))
    if (!res) return
    expect(res).toBeDefined()
  })
})
