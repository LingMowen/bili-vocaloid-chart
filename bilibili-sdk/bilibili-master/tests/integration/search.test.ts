/**
 * Search API 集成测试
 *
 * 搜索接口使用 wbi 签名，需要初始化 WbiSigner。
 * 在匿名客户端下可能因缺乏 wbi 签名而失败。
 */
import { expect } from 'vitest'

import { search, searchSuggest, getHotSearch } from '../../src/api'

import { createAnonymousClient, describeIf, expectApiSuccess } from './helpers.js'

const client = createAnonymousClient()

// WBI 签名的接口在匿名客户端下可能因缺失 mixin_key 而失败
// 这里测试是否能正常发起请求（至少不崩溃）
describeIf('BILIBILI_WBI_READY')('Search API', () => {
  it('search 返回搜索结果', async () => {
    const res = await expectApiSuccess(() => search(client, { keyword: 'test' }))
    if (!res) return
    expect(res.code).toBe(0)
  })

  it('searchSuggest 返回建议', async () => {
    const res = await expectApiSuccess(() => searchSuggest(client, { term: 'bili' }))
    if (!res) return
    expect(res.code).toBe(0)
  })

  it('getHotSearch 返回热搜', async () => {
    const res = await expectApiSuccess(() => getHotSearch(client))
    if (!res) return
    expect(res.code).toBe(0)
  })
})
