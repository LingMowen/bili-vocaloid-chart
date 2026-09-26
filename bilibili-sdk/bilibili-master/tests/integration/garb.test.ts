/**
 * Garb API 集成测试
 */
import { describe, expect } from 'vitest'

import { searchGarb, getGarbList, getDlcBasic, getGarbDetail } from '../../src/api'

import { createAnonymousClient, expectApiSuccess } from './helpers.js'

const client = createAnonymousClient()

describe('Garb API', () => {
  it('searchGarb 搜索装扮', async () => {
    const res = await expectApiSuccess(() => searchGarb(client, 'test'))
    if (!res) return
    expect(res).toBeDefined()
  })

  it('getGarbList 返回装扮列表', async () => {
    const res = await expectApiSuccess(() => getGarbList(client))
    if (!res) return
    expect(res).toBeDefined()
  })

  it('getDlcBasic 返回收藏集信息', async () => {
    const res = await expectApiSuccess(() => getDlcBasic(client, 12345))
    if (!res) return
    expect(res).toBeDefined()
  })

  it('getGarbDetail 返回装扮详情', async () => {
    const res = await expectApiSuccess(() => getGarbDetail(client, 12345))
    if (!res) return
    expect(res).toBeDefined()
  })
})
