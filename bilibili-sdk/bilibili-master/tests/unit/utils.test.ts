import { describe, expect, it } from 'vitest'

import { aid2bvid, bvid2aid, formatImageUrl, parseCookie, hmacSha256, md5 } from '../../src/utils'

// AV/BV 互转

describe('aid2bvid / bvid2aid', () => {
  it('aid2bvid → bvid2aid 往返一致性 (1-5000)', () => {
    for (let aid = 1; aid < 5000; aid++) {
      expect(bvid2aid(aid2bvid(aid))).toBe(aid)
    }
  })

  it('生成合法 BV 号格式', () => {
    const bvid = aid2bvid(170001)
    expect(bvid).toMatch(/^BV1[0-9A-Za-z]{9}$/)
  })

  it('已知双向转换验证', () => {
    // 已知值: aid=170001 → BV17x411w7KC
    expect(aid2bvid(170001)).toBe('BV17x411w7KC')
    expect(bvid2aid('BV17x411w7KC')).toBe(170001)
  })

  it('aid=0 也能转换', () => {
    const bvid = aid2bvid(0)
    expect(bvid).toMatch(/^BV1/)
    expect(bvid2aid(bvid)).toBe(0)
  })

  it('大 aid 号也能正确转换', () => {
    const bigAid = 100000000
    const bvid = aid2bvid(bigAid)
    expect(bvid).toMatch(/^BV1/)
    expect(bvid2aid(bvid)).toBe(bigAid)
  })

  it('bvid2aid 抛异常 on 无效字符', () => {
    expect(() => bvid2aid('BV1!!invalid!!')).toThrow('无效的 BV 号字符')
  })

  it('bvid2aid 抛异常 on 空字符串', () => {
    expect(() => bvid2aid('')).toThrow()
  })
})

// 图片 URL 格式化

describe('formatImageUrl', () => {
  const baseUrl = 'https://i0.hdslb.com/bfs/archive/abc123.jpg'

  it('指定宽高时追加 @w_h.webp', () => {
    const result = formatImageUrl(baseUrl, 200, 200)
    expect(result).toBe('https://i0.hdslb.com/bfs/archive/abc123.jpg@200w_200h.webp')
  })

  it('仅指定宽度', () => {
    const result = formatImageUrl(baseUrl, 400)
    expect(result).toBe('https://i0.hdslb.com/bfs/archive/abc123.jpg@400w.webp')
  })

  it('仅指定高度', () => {
    const result = formatImageUrl(baseUrl, undefined, 300)
    expect(result).toBe('https://i0.hdslb.com/bfs/archive/abc123.jpg@300h.webp')
  })

  it('指定 png 格式', () => {
    const result = formatImageUrl(baseUrl, 100, 100, 'png')
    expect(result).toBe('https://i0.hdslb.com/bfs/archive/abc123.jpg@100w_100h.png')
  })

  it('无尺寸时仅追加 @.webp', () => {
    const result = formatImageUrl(baseUrl, undefined, undefined, 'webp')
    expect(result).toBe('https://i0.hdslb.com/bfs/archive/abc123.jpg@.webp')
  })

  it('已有 @ 后缀时替换', () => {
    const result = formatImageUrl(`${baseUrl}@old.webp`, 200, 200)
    expect(result).toBe('https://i0.hdslb.com/bfs/archive/abc123.jpg@200w_200h.webp')
  })

  it('无尺寸且无 format 时原样返回', () => {
    const result = formatImageUrl(baseUrl)
    expect(result).toBe(baseUrl)
  })

  it('无尺寸但 format 不是 webp 时原样返回', () => {
    // format='png' 但 url 不含 @ → 原样返回（format 只有在有尺寸或 webp 时才生效）
    const result = formatImageUrl(baseUrl, undefined, undefined, 'png')
    expect(result).toBe(baseUrl)
  })

  it('无尺寸无 format 已有 @ 后缀时原样返回', () => {
    const url = `${baseUrl}@200w.webp`
    const result = formatImageUrl(url)
    expect(result).toBe(url)
  })
})

// Cookie 解析

describe('parseCookie', () => {
  it('解析标准 cookie 字符串', () => {
    const result = parseCookie('SESSDATA=abc; bili_jct=def; DedeUserID=1')
    expect(result.SESSDATA).toBe('abc')
    expect(result.bili_jct).toBe('def')
    expect(result.DedeUserID).toBe('1')
  })

  it('空字符串返回空对象', () => {
    expect(parseCookie('')).toEqual({})
  })

  it('忽略无值的键', () => {
    const result = parseCookie('SESSDATA=abc; foo; bar=')
    expect(result.SESSDATA).toBe('abc')
    expect(result.foo).toBeUndefined()
    expect(result.bar).toBe('')
  })

  it('处理带空格的值', () => {
    const result = parseCookie('key= value ')
    expect(result.key).toBe('value')
  })

  it('处理多个等号的值', () => {
    const result = parseCookie('key=foo=bar')
    expect(result.key).toBe('foo=bar')
  })

  it('分号后有多余空格', () => {
    const result = parseCookie('a=1;  b=2')
    expect(result.a).toBe('1')
    expect(result.b).toBe('2')
  })

  it('忽略等号前为空的键', () => {
    const result = parseCookie('a=1; =value')
    expect(result.a).toBe('1')
    expect(result['']).toBeUndefined()
  })
})

// 重导出的哈希函数

describe('重导出 hmacSha256 / md5', () => {
  it('md5 计算结果正确', () => {
    expect(md5('test')).toBe('098f6bcd4621d373cade4e832627b4f6')
  })

  it('hmacSha256 计算结果正确', () => {
    expect(hmacSha256('k', 'm')).toHaveLength(64)
  })
})
